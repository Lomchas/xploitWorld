import { backendTranslator } from "../locales";
import {
  formatCommandTable,
  type Locale,
  TUTORIAL_MISSIONS,
  resolveVirtualPath,
  tokenizeCommand,
  WORKSPACE_ROOT,
  type CmdResponsePayload,
  type WorkspaceKind,
} from "@null-protocol/shared";
import { posix } from "node:path";
import {
  DELEGATED_FILE,
  HOME,
  dossierFor,
  RELAY,
  scenarioFiles,
  localizeScenarioFiles,
  sha256,
  type ScenarioFile,
} from "./scenarios";

type FileEntry = {
  kind: "file";
  binary?: { digest: string; bytes: number; mime: string };
} & Omit<ScenarioFile, "path">;
type Entry = { kind: "directory"; mode?: number } | FileEntry;
interface MountedEntry {
  path: string;
  kind: WorkspaceKind;
  mode: number;
  text: string | null;
  digest: string | null;
  mime: string | null;
  bytes: number;
}
const isPersonal = (path: string): boolean =>
  path === WORKSPACE_ROOT || path.startsWith(WORKSPACE_ROOT + "/");
const modeOf = (entry: FileEntry): number => entry.mode ?? 0o644;
const readable = (entry: FileEntry): boolean =>
  Boolean(modeOf(entry) & (entry.owner === "root" ? 0o004 : 0o400));

const HELP: readonly (readonly [string, string])[] = [
  ["ls [-la] [ruta]", "Lista archivos, permisos y ocultos."],
  ["cd [ruta] | pwd", "Cambia o muestra el directorio."],
  ["cat <archivo>", "Lee el contenido de un archivo."],
  ["head | tail <archivo>", "Muestra las primeras o últimas 10 líneas."],
  ["wc <archivo>", "Cuenta líneas, palabras y bytes."],
  ["grep [-n] <texto> <archivo>", "Busca texto; -n numera las líneas."],
  ["find | tree [ruta]", "Explora rutas del escenario."],
  ["stat <archivo>", "Inspecciona permisos y propietario."],
  ["chmod <modo> <archivo>", "Cambia los permisos de un archivo propio."],
  ["mkdir <ruta> | touch <ruta>", "Crea carpetas o archivos en ~/trabajo."],
  ['write <ruta> "texto"', "Guarda texto en tu equipo."],
  [
    "rm <archivo> | rmdir <ruta>",
    "Borra un archivo o una carpeta vacía de ~/trabajo.",
  ],
  ["ps | kill <pid>", "Lista procesos o envía SIGTERM."],
  ["ip addr", "Inspecciona interfaces virtuales."],
  ["curl <url>", "Consulta un relé interno del escenario."],
  ["sudo -l", "Muestra el permiso delegado."],
  ["sudo cat <archivo>", "Lee el archivo autorizado."],
  ["base64 -d <archivo>", "Decodifica el contenido."],
  ["sha256sum [-c] <archivo>", "Calcula un hash o verifica un manifiesto."],
  ["whoami | id | uname | env", "Consulta el entorno virtual."],
  ["echo [archivo]", "Abre el editor multilínea. Ctrl+O guarda y Ctrl+X sale."],
  ['echo [-n] "texto"', "Muestra texto. -n omite el salto final."],
  ['echo "texto" > ruta', "Crea o reemplaza un archivo de ~/trabajo."],
  ['echo "texto" >> ruta', "Agrega texto al final de un archivo."],
  ["clear", "Limpia la pantalla."],
  ["levels | progress", "Consulta misiones y progreso."],
  ["status | ip addr", "Consulta la billetera y la red del escenario."],
  ["mission <slug>", "Abre un escenario desbloqueado."],
  ["mission continuar", "Abre el siguiente nivel pendiente."],
  ["check [respuesta] | hint", "Entrega evidencia o consulta una pista."],
  [
    "set [control valor] | test [prueba]",
    "Ajusta y comprueba la réplica del caso.",
  ],
  ["branch [id]", "Lista o abre una historia secundaria."],
  ["submit <slug> <flag>", "Entrega una flag del tutorial."],
  ["certificado | epilogo", "Consulta la evaluación o el cierre de Historia."],
  ["open <ruta> | import <ruta>", "Abre un documento o incorpora una imagen."],
  [
    "dossier",
    "Consulta el índice de registros con la CPU de operaciones equipada.",
  ],
  ["history | help", "Consulta historial o comandos."],
];

/** The shell owns only fictional files, processes and relay responses. */
export class VirtualShell {
  private cwd = HOME;
  private entries = new Map<string, Entry>();
  private slug: string = TUTORIAL_MISSIONS[0].slug;
  private flag: string | null = null;
  private processRunning = false;
  private delegatedFile: string | null = null;

  private locale: Locale = "es";
  private t = backendTranslator(this.locale);

  setLocale(locale: Locale): void {
    if (locale === this.locale) return;
    this.locale = locale;
    this.t = backendTranslator(locale);
  }

  constructor(tutorialFlag: string | null = null) {
    this.openMission(TUTORIAL_MISSIONS[0].slug, tutorialFlag);
  }

  get directory(): string {
    return this.cwd;
  }

  openMission(
    slug: string,
    flag: string | null,
    files: ScenarioFile[] = [],
    delegatedFile: string | null = null,
  ): void {
    this.cwd = HOME;
    this.slug = slug;
    this.flag = flag;
    this.processRunning = slug === TUTORIAL_MISSIONS[2].slug;
    this.delegatedFile =
      slug === TUTORIAL_MISSIONS[4].slug ? DELEGATED_FILE : delegatedFile;
    this.entries = new Map([
      ["/", { kind: "directory" }],
      ["/home", { kind: "directory" }],
      [HOME, { kind: "directory" }],
      ["/etc", { kind: "directory" }],
      ["/etc/hostname", { kind: "file", content: "xploitworld\n" }],
    ]);
    this.addSceneFiles([...scenarioFiles(slug, flag, this.locale), ...files]);
  }

  addSceneFiles(files: ScenarioFile[]): void {
    for (const { path, ...file } of localizeScenarioFiles(files, this.locale)) {
      const components = path.split("/").slice(1, -1);
      let directory = "";
      for (const component of components) {
        directory += "/" + component;
        if (!this.entries.has(directory))
          this.entries.set(directory, { kind: "directory" });
      }
      this.entries.set(path, { kind: "file", ...file });
    }
  }

  mountWorkspace(rows: MountedEntry[]): void {
    for (const path of this.entries.keys()) {
      if (isPersonal(path)) this.entries.delete(path);
    }
    this.entries.set(WORKSPACE_ROOT, { kind: "directory", mode: 0o700 });
    for (const row of rows) {
      const entry: Entry =
        row.kind === "DIRECTORY"
          ? { kind: "directory", mode: row.mode }
          : {
              kind: "file",
              content: row.text ?? "",
              mode: row.mode,
              ...(row.digest && row.mime
                ? {
                    binary: {
                      digest: row.digest,
                      bytes: row.bytes,
                      mime: row.mime,
                    },
                  }
                : {}),
            };
      this.entries.set(row.path, entry);
    }
    if (isPersonal(this.cwd) && !this.entries.has(this.cwd))
      this.cwd = WORKSPACE_ROOT;
  }

  resolve(input = "."): string {
    return resolveVirtualPath(input, this.cwd);
  }

  private canReach(path: string, bits = 0o100): boolean {
    if (!isPersonal(path) || path === WORKSPACE_ROOT) return true;
    for (
      let parent = posix.dirname(path);
      parent !== WORKSPACE_ROOT;
      parent = posix.dirname(parent)
    ) {
      const entry = this.entries.get(parent);
      if (
        entry?.kind === "directory" &&
        ((entry.mode ?? 0o755) & bits) !== bits
      )
        return false;
    }
    return true;
  }

  private children(path: string): string[] {
    const prefix = path === "/" ? "/" : path + "/";
    return [...this.entries.keys()]
      .filter(
        (key) =>
          key !== path &&
          key.startsWith(prefix) &&
          !key.slice(prefix.length).includes("/"),
      )
      .map((key) => key.slice(prefix.length))
      .sort();
  }

  private listEntry(path: string, name: string, long: boolean): string {
    const entry = this.entries.get(path)!;
    if (!long) return name + (entry.kind === "directory" ? "/" : "");
    const mode = entry.mode ?? (entry.kind === "directory" ? 0o755 : 0o644);
    const flags = Array.from("rwxrwxrwx", (symbol, index) =>
      mode & (1 << (8 - index)) ? symbol : "-",
    ).join("");
    const owner = entry.kind === "file" ? (entry.owner ?? "guest") : "guest";
    return (
      (entry.kind === "directory" ? "d" : "-") +
      flags +
      " " +
      owner +
      " " +
      owner +
      "  " +
      name
    );
  }

  execute(raw: string): CmdResponsePayload {
    const t = this.t;
    const result = (output: string, exitCode = 0): CmdResponsePayload => ({
      output: output.slice(0, 16_000),
      exitCode,
      cwd: this.cwd,
    });
    const parsed = tokenizeCommand(raw);
    if (parsed.error) return result(t(parsed.error), 2);
    const { command, args, flags } = parsed;
    const first = args[0] ?? ".";
    const missing = (path: string) =>
      result(
        command + ": " + path + t(": No existe el archivo o directorio"),
        1,
      );
    const denied = (path: string) =>
      result(command + ": " + path + t(": Permiso denegado"), 1);
    switch (command) {
      case "help":
        return result(
          formatCommandTable(
            HELP.map(([syntax, description]) => [t(syntax), t(description)]),
            t,
          ) + t("\n\nLee el encargo con cat README.txt."),
        );
      case "pwd":
        return result(this.cwd);
      case "whoami":
        return result("guest");
      case "id":
        return result("uid=1000(guest) gid=1000(guest) groups=1000(guest)");
      case "uname":
        return result(
          flags.a
            ? "Linux xploitworld 0.3.0 VIRTUAL x86_64"
            : "Linux (virtual)",
        );
      case "env":
        return result(
          "USER=guest\nHOME=" + HOME + "\nSHELL=/bin/virtual\nPWD=" + this.cwd,
        );
      case "ps":
        return result(
          " PID TTY      TIME CMD\n   1 pts/0 00:00:00 virtual-shell" +
            (this.processRunning ? "\n 401 pts/0 00:00:02 relevo" : ""),
        );
      case "kill":
        if (args.length !== 1 || !/^\d+$/.test(first))
          return result(t("Uso: kill <pid>"), 2);
        if (first !== "401" || !this.processRunning)
          return result(
            first === "1"
              ? t("kill: Operación no permitida")
              : t("kill: No existe el proceso"),
            1,
          );
        this.processRunning = false;
        this.entries.set(HOME + "/turno/dump.txt", {
          kind: "file",
          content: (this.flag ?? "") + "\n",
        });
        return result("");
      case "ip":
        return args.length === 1 && (first === "addr" || first === "a")
          ? result(
              "1: lo: <LOOPBACK,UP>\n    inet 127.0.0.1/8 scope host lo\n2: vnet0: <UP>\n    inet 192.0.2.24/24 scope global vnet0",
            )
          : result(t("Uso: ip addr"), 2);
      case "curl":
        if (args.length !== 1) return result(t("Uso: curl <url>"), 2);
        return this.slug === TUTORIAL_MISSIONS[3].slug && first === RELAY
          ? result(
              JSON.stringify({
                relay: "lab",
                status: "online",
                flag: this.flag,
              }),
            )
          : result(t("curl: (6) Relé desconocido en el escenario."), 6);
      case "sudo":
        if (!this.delegatedFile)
          return result(
            t("sudo: no hay permisos delegados en este escenario."),
            1,
          );
        if (flags.l && args.length === 0)
          return result(
            t(
              "El usuario guest puede ejecutar este comando:\n    (root) NOPASSWD: /bin/cat ",
            ) + this.delegatedFile,
          );
        if (
          args.length === 2 &&
          first === "cat" &&
          this.resolve(args[1]) === this.delegatedFile
        ) {
          const file = this.entries.get(this.delegatedFile);
          if (file?.kind === "file")
            return result(file.content.replace(/\n$/, ""));
        }
        return denied(args.slice(1).join(" "));
      case "clear":
        return result("");
      case "echo":
        if (parsed.redirect)
          return result(t("echo: el espacio de trabajo no está montado."), 1);
        return result(args.join(" "));
      case "cd": {
        const path = args.length ? this.resolve(first) : HOME;
        const entry = this.entries.get(path);
        if (!this.canReach(path)) return denied(first);
        if (!entry) return missing(first);
        if (entry.kind !== "directory")
          return result("cd: " + first + t(": No es un directorio"), 1);
        if (!((entry.mode ?? 0o755) & 0o100)) return denied(first);
        this.cwd = path;
        return result("");
      }
      case "ls": {
        const path = this.resolve(first);
        const entry = this.entries.get(path);
        if (!this.canReach(path)) return denied(first);
        if (!entry) return missing(first);
        if (entry.kind === "file")
          return result(this.listEntry(path, first, Boolean(flags.l)));
        if (((entry.mode ?? 0o755) & 0o500) !== 0o500) return denied(first);
        const files = this.children(path).filter(
          (name) => flags.a || flags.all || !name.startsWith("."),
        );
        return result(
          files
            .map((name) =>
              this.listEntry(
                (path === "/" ? "" : path) + "/" + name,
                name,
                Boolean(flags.l),
              ),
            )
            .join(flags.l ? "\n" : "  "),
        );
      }
      case "stat": {
        const path = this.resolve(first);
        if (!this.canReach(path)) return denied(first);
        const entry = this.entries.get(path);
        if (!entry) return missing(first);
        const mode = entry.mode ?? (entry.kind === "file" ? 0o644 : 0o755);
        const owner =
          entry.kind === "file" ? (entry.owner ?? "guest") : "guest";
        return result(
          t("Archivo: ") +
            first +
            t("\nModo: ") +
            mode.toString(8).padStart(4, "0") +
            t("\nPropietario: ") +
            owner +
            (entry.kind === "file" && entry.binary
              ? t("\nTipo: {v1}\nTamaño: {v2} bytes", {
                  v1: entry.binary.mime,
                  v2: entry.binary.bytes,
                })
              : ""),
        );
      }
      case "chmod": {
        if (args.length !== 2 || !/^(0?[0-7]{3})$/.test(first))
          return result(t("Uso: chmod <modo octal> <archivo>"), 2);
        const name = args[1]!;
        const entry = this.entries.get(this.resolve(name));
        if (!entry) return missing(name);
        if (entry.kind !== "file" || entry.owner === "root")
          return denied(name);
        entry.mode = Number.parseInt(first, 8);
        return result("");
      }
      case "base64":
      case "sha256sum": {
        if (
          !args.length ||
          (command === "base64" && (args.length !== 1 || !flags.d))
        )
          return result(
            t("Uso: ") +
              command +
              (command === "base64" ? " -d" : " [-c]") +
              t(" <archivo>"),
            2,
          );
        const output: string[] = [];
        let failed = false;
        for (const name of args) {
          const path = this.resolve(name);
          if (!this.canReach(path)) return denied(name);
          const entry = this.entries.get(path);
          if (!entry) return missing(name);
          if (entry.kind !== "file" || !readable(entry)) return denied(name);
          if (command === "base64") {
            if (entry.binary)
              return result(t("Usa open para visualizar la imagen."), 1);
            const encoded = entry.content.replace(/\s/g, "");
            if (
              !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                encoded,
              )
            )
              return result(t("base64: entrada inválida"), 1);
            return result(
              Buffer.from(encoded, "base64")
                .toString("utf8")
                .replace(/\n$/, ""),
            );
          }
          if (!flags.c) {
            output.push(
              (entry.binary?.digest ?? sha256(entry.content)) + "  " + name,
            );
            continue;
          }
          const line = /^([0-9a-f]{64}) {2}([^\n]+)\n?$/.exec(entry.content);
          if (!line)
            return result(
              t("sha256sum: el manifiesto no tiene líneas válidas"),
              1,
            );
          const samplePath = this.resolve(line[2]);
          const sample = this.entries.get(samplePath);
          const ok =
            sample?.kind === "file" &&
            this.canReach(samplePath) &&
            readable(sample) &&
            (sample.binary?.digest ?? sha256(sample.content)) === line[1];
          output.push(line[2] + (ok ? ": OK" : ": FAILED"));
          failed ||= !ok;
          const dossier = ok ? dossierFor(this.slug, path) : undefined;
          if (dossier) {
            this.entries.set(dossier.receipt, {
              kind: "file",
              content:
                t(dossier.clue) + (this.flag ? "\n\n" + this.flag : "") + "\n",
            });
            output.push(t("Documento liberado en ") + dossier.receipt);
          }
        }
        return result(output.join("\n"), failed ? 1 : 0);
      }
      case "cat":
      case "open":
      case "head":
      case "tail":
      case "wc":
      case "grep": {
        const filenames = command === "grep" ? args.slice(1) : args;
        if (
          filenames.length === 0 ||
          (command === "open" && filenames.length !== 1)
        )
          return result(
            t("Uso: ") +
              command +
              (command === "grep" ? t(" <texto>") : "") +
              t(" <archivo>"),
            2,
          );
        const outputs: string[] = [];
        for (const filename of filenames) {
          const path = this.resolve(filename);
          if (!this.canReach(path)) return denied(filename);
          const entry = this.entries.get(path);
          if (!entry) return missing(filename);
          if (entry.kind !== "file")
            return result(
              command + ": " + filename + t(": Es un directorio"),
              1,
            );
          if (!readable(entry)) return denied(filename);
          if (entry.binary)
            return command === "open"
              ? { ...result(t("Imagen: ") + filename), imagePath: path }
              : result(t("Usa open para visualizar la imagen."), 1);
          const lines = entry.content.split("\n");
          if (lines.at(-1) === "") lines.pop();
          if (command === "wc")
            outputs.push(
              [
                lines.length,
                entry.content.trim().split(/\s+/).filter(Boolean).length,
                Buffer.byteLength(entry.content),
                filename,
              ].join(" "),
            );
          else if (command === "grep")
            outputs.push(
              lines
                .flatMap((line, index) =>
                  line.includes(first)
                    ? [(flags.n ? String(index + 1) + ":" : "") + line]
                    : [],
                )
                .join("\n"),
            );
          else if (command === "head")
            outputs.push(lines.slice(0, 10).join("\n"));
          else if (command === "tail")
            outputs.push(lines.slice(-10).join("\n"));
          else outputs.push(entry.content.replace(/\n$/, ""));
        }
        const output = outputs.join("\n");
        return result(output, command === "grep" && !output ? 1 : 0);
      }
      case "find":
      case "tree": {
        const path = this.resolve(first);
        if (!this.canReach(path)) return denied(first);
        if (!this.entries.has(path)) return missing(first);
        return result(
          [...this.entries.keys()]
            .filter(
              (key) =>
                key === path ||
                (key.startsWith((path === "/" ? "" : path) + "/") &&
                  this.canReach(key, 0o500)),
            )
            .sort()
            .join("\n"),
        );
      }
      default:
        return result(
          t("Comando ") + command + t(" no implementado. Usa help."),
          127,
        );
    }
  }
}
