import { createHash, randomUUID } from "node:crypto";
import { posix } from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  isRecord,
  WORKSPACE_LIMITS,
  WORKSPACE_ROOT,
  type WorkspaceAction,
  type WorkspaceEntry,
  type WorkspaceImageType,
  type WorkspaceListing,
  type WorkspaceText,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";

const READ = 0o400;
const WRITE = 0o200;
const ENTER = 0o100;
const metadata = {
  path: true,
  kind: true,
  mode: true,
  mime: true,
  bytes: true,
  version: true,
  updatedAt: true,
} as const;
type Row = Prisma.WorkspaceEntryGetPayload<{ select: typeof metadata }>;
type Tx = Prisma.TransactionClient;
const denied = () =>
  new HttpError(403, "Permiso denegado en el espacio de trabajo.");
const absent = () =>
  new HttpError(404, "La ruta no existe en tu espacio de trabajo.");
const conflict = () =>
  new HttpError(
    409,
    "El archivo cambió. Vuelve a abrirlo para ver la versión actual.",
  );
const etag = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);

function checkedPath(value: unknown, root: string, allowRoot = false): string {
  const prefix = root + "/";
  if (allowRoot && (value === undefined || value === root)) return root;
  if (
    typeof value !== "string" ||
    value.length > 240 ||
    !value.startsWith(prefix)
  )
    throw new HttpError(400, "Usa una ruta dentro de " + root + ".");
  const normalized = value.normalize("NFC");
  const names = normalized.slice(prefix.length).split("/");
  if (
    names.some(
      (name) =>
        name.length > 80 ||
        name !== name.trim() ||
        name === "." ||
        name === ".." ||
        !/^[\p{L}\p{M}\p{N} ._()-]+$/u.test(name),
    )
  )
    throw new HttpError(400, "Usa nombres válidos de hasta 80 caracteres.");
  return normalized;
}

export function parseWorkspaceAction(
  value: unknown,
  root = WORKSPACE_ROOT,
): WorkspaceAction {
  if (!isRecord(value))
    throw new HttpError(400, "Operación de archivo inválida.");
  const path = checkedPath(value.path, root);
  const { type, version, append } = value;
  if (type === "mkdir" || type === "touch") return { type, path };
  if (
    type === "write" &&
    typeof value.text === "string" &&
    (append === undefined || typeof append === "boolean") &&
    (version === null || version === undefined || etag(version))
  )
    return { type, path, text: value.text, append, version };
  if (
    type === "remove" &&
    (version === undefined || etag(version)) &&
    (value.kind === undefined ||
      value.kind === "file" ||
      value.kind === "directory")
  )
    return { type, path, version, kind: value.kind };
  if (
    type === "chmod" &&
    (version === undefined || etag(version)) &&
    typeof value.mode === "number" &&
    Number.isInteger(value.mode) &&
    value.mode >= 0 &&
    value.mode <= 0o777
  )
    return { type, path, mode: value.mode, version };
  throw new HttpError(400, "Operación de archivo inválida.");
}

function entryView(row: Row): WorkspaceEntry {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

async function assertDirectories(
  tx: Tx,
  userId: string,
  directory: string,
  required: number,
  root: string,
): Promise<void> {
  if (directory === root) return;
  const paths: string[] = [];
  for (
    let current = directory;
    current !== root;
    current = posix.dirname(current)
  )
    paths.push(current);
  const rows = await tx.workspaceEntry.findMany({
    where: { userId, path: { in: paths } },
    select: { path: true, kind: true, mode: true },
  });
  const byPath = new Map(rows.map((row) => [row.path, row]));
  for (const path of paths.reverse()) {
    const row = byPath.get(path);
    if (!row) throw absent();
    if (row.kind !== "DIRECTORY")
      throw new HttpError(
        409,
        "La ruta contiene un archivo en lugar de una carpeta.",
      );
    const bits = path === directory ? ENTER | required : ENTER;
    if ((row.mode & bits) !== bits) throw denied();
  }
}

async function checkQuota(
  tx: Tx,
  userId: string,
  previous: Row | null,
  size: number,
  isText = false,
  root = WORKSPACE_ROOT,
): Promise<void> {
  const hasStorage =
    root === WORKSPACE_ROOT &&
    (await tx.inventoryItem.findFirst({
      where: { userId, sku: "ssd", state: { in: ["READY", "EQUIPPED"] } },
      select: { id: true },
    }));
  const totals = await tx.workspaceEntry.groupBy({
    by: ["kind"],
    where: { userId },
    _count: { _all: true },
    _sum: { bytes: true },
  });
  const bytes = totals.reduce((sum, row) => sum + (row._sum.bytes ?? 0), 0);
  const count = totals.reduce((sum, row) => sum + row._count._all, 0);
  const textBytes = totals.find((row) => row.kind === "TEXT")?._sum.bytes ?? 0;
  if (
    (!previous && count >= (hasStorage ? 240 : WORKSPACE_LIMITS.entries)) ||
    bytes - (previous?.bytes ?? 0) + size > WORKSPACE_LIMITS.totalBytes ||
    (isText &&
      textBytes - (previous?.bytes ?? 0) + size >
        WORKSPACE_LIMITS.totalTextBytes)
  )
    throw new HttpError(
      409,
      "Se alcanzó el límite de almacenamiento. Libera espacio e inténtalo de nuevo.",
    );
}

function imageType(data: Buffer): WorkspaceImageType | undefined {
  if (data.length < 16) return undefined;
  if (
    data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.toString("ascii", 12, 16) === "IHDR"
  )
    return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255)
    return "image/jpeg";
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return undefined;
}

export class WorkspaceService {
  constructor(
    private readonly db: PrismaClient,
    private readonly root = WORKSPACE_ROOT,
  ) {}

  list(userId: string, input: unknown): Promise<WorkspaceListing> {
    const path = checkedPath(input, this.root, true);
    const prefix = path + "/";
    return this.db.$transaction(
      async (tx) => {
        await assertDirectories(tx, userId, path, READ, this.root);
        const entries = await tx.workspaceEntry.findMany({
          where: { userId },
          select: metadata,
        });
        return {
          path,
          usedBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
          usedEntries: entries.length,
          entries: entries
            .filter(
              (entry) =>
                entry.path.startsWith(prefix) &&
                !entry.path.slice(prefix.length).includes("/"),
            )
            .sort(
              (a, b) =>
                Number(b.kind === "DIRECTORY") -
                  Number(a.kind === "DIRECTORY") ||
                a.path.localeCompare(b.path),
            )
            .map(entryView),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  text(userId: string, input: unknown): Promise<WorkspaceText> {
    return this.read(userId, input, { ...metadata, text: true }).then(
      (entry) => {
        if (entry.kind !== "TEXT" || entry.text === null)
          throw new HttpError(409, "Abre un archivo de texto.");
        const { text, ...info } = entry;
        return { ...entryView(info), text };
      },
    );
  }

  async image(
    userId: string,
    input: unknown,
  ): Promise<{ image: Buffer; mime: WorkspaceImageType }> {
    const entry = await this.read(userId, input, {
      kind: true,
      image: true,
      mime: true,
      mode: true,
    });
    const mime = entry.mime;
    if (
      entry.kind !== "IMAGE" ||
      !entry.image ||
      (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp")
    )
      throw new HttpError(409, "Selecciona una imagen.");
    return { image: Buffer.from(entry.image), mime };
  }

  private read<Select extends Prisma.WorkspaceEntrySelect & { mode: true }>(
    userId: string,
    input: unknown,
    select: Select,
  ) {
    const path = checkedPath(input, this.root);
    return this.db.$transaction(
      async (tx) => {
        await assertDirectories(tx, userId, posix.dirname(path), 0, this.root);
        const row = await tx.workspaceEntry.findUnique({
          where: { userId_path: { userId, path } },
          select,
        });
        if (!row) throw absent();
        if (!((row as { mode: number }).mode & READ)) throw denied();
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  shellEntries(userId: string) {
    return this.db.workspaceEntry.findMany({
      where: { userId },
      select: {
        path: true,
        kind: true,
        mode: true,
        text: true,
        digest: true,
        bytes: true,
        mime: true,
      },
    });
  }

  async mutate(
    userId: string,
    action: WorkspaceAction,
  ): Promise<WorkspaceEntry | null> {
    const path = checkedPath(action.path, this.root);
    const parent = posix.dirname(path);
    const where = { userId_path: { userId, path } };
    const version = randomUUID();
    return this.writeTransaction(userId, async (tx) => {
      await assertDirectories(tx, userId, parent, 0, this.root);
      const row = await tx.workspaceEntry.findUnique({
        where,
        select: { ...metadata, text: true },
      });
      if (
        "version" in action &&
        action.version !== undefined &&
        action.version !== (row?.version ?? null)
      )
        throw conflict();
      if (action.type === "remove") {
        if (!row) throw absent();
        await assertDirectories(tx, userId, parent, WRITE, this.root);
        const isDirectory = row.kind === "DIRECTORY";
        if (
          (action.kind === "file" && isDirectory) ||
          (action.kind === "directory" && !isDirectory)
        )
          throw new HttpError(
            409,
            isDirectory
              ? "Usa rmdir para una carpeta vacía."
              : "La ruta es un archivo.",
          );
        if (
          isDirectory &&
          (await tx.workspaceEntry.count({
            where: { userId, path: { startsWith: path + "/" } },
          }))
        )
          throw new HttpError(409, "Vacía la carpeta antes de eliminarla.");
        await tx.workspaceEntry.delete({ where });
        return null;
      }
      if (action.type === "chmod") {
        if (!row) throw absent();
        return entryView(
          await tx.workspaceEntry.update({
            where,
            data: { mode: action.mode, version },
            select: metadata,
          }),
        );
      }
      if (action.type === "mkdir" && row)
        throw new HttpError(
          409,
          "Ya existe un archivo o carpeta con ese nombre.",
        );
      if (
        row?.kind === "DIRECTORY" ||
        (action.type === "write" && row?.kind === "IMAGE")
      )
        throw new HttpError(
          409,
          "La ruta no corresponde a un archivo de texto.",
        );
      if (row && !(row.mode & WRITE)) throw denied();
      if (!row) await assertDirectories(tx, userId, parent, WRITE, this.root);
      if (action.type === "touch" && row)
        return entryView(
          await tx.workspaceEntry.update({
            where,
            data: { version },
            select: metadata,
          }),
        );
      const text =
        action.type === "write"
          ? (action.append ? (row?.text ?? "") : "") + action.text
          : action.type === "touch"
            ? ""
            : null;
      const bytes = Buffer.byteLength(text ?? "");
      // PostgreSQL text disallows NUL. Terminal output is independently scrubbed.
      if (text?.includes("\0") || bytes > WORKSPACE_LIMITS.fileTextBytes)
        throw new HttpError(400, "Usa texto sin bytes nulos de hasta 16 KiB.");
      await checkQuota(tx, userId, row, bytes, text !== null, this.root);
      const data = { text, bytes, version };
      const saved = row
        ? await tx.workspaceEntry.update({ where, data, select: metadata })
        : await tx.workspaceEntry.create({
            data: {
              ...data,
              userId,
              path,
              kind: text === null ? "DIRECTORY" : "TEXT",
              mode: text === null ? 0o700 : 0o600,
            },
            select: metadata,
          });
      return entryView(saved);
    });
  }

  importImage(
    userId: string,
    input: unknown,
    image: Buffer,
    contentType: unknown,
  ): Promise<WorkspaceEntry> {
    const path = checkedPath(input, this.root);
    const mime = imageType(image);
    if (
      !mime ||
      mime !== contentType ||
      image.length > WORKSPACE_LIMITS.fileImageBytes
    )
      throw new HttpError(
        415,
        "Selecciona un PNG, JPEG o WebP de hasta 2 MiB.",
      );
    return this.writeTransaction(userId, async (tx) => {
      await assertDirectories(
        tx,
        userId,
        posix.dirname(path),
        WRITE,
        this.root,
      );
      if (
        await tx.workspaceEntry.findUnique({
          where: { userId_path: { userId, path } },
          select: { path: true },
        })
      )
        throw new HttpError(
          409,
          "Ya existe un archivo o carpeta con ese nombre.",
        );
      await checkQuota(tx, userId, null, image.length, false, this.root);
      return entryView(
        await tx.workspaceEntry.create({
          data: {
            userId,
            path,
            kind: "IMAGE",
            mode: 0o600,
            image: new Uint8Array(image),
            mime,
            bytes: image.length,
            digest: createHash("sha256").update(image).digest("hex"),
            version: randomUUID(),
          },
          select: metadata,
        }),
      );
    });
  }

  private writeTransaction<T>(
    userId: string,
    operation: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      // Folder permissions, quota and edits share a lock across browser tabs and API workers.
      const users = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      if (!users.length)
        throw new HttpError(401, "La sesión ya no está disponible.");
      return operation(tx);
    });
  }
}
