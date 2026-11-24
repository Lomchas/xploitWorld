import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ARENA_HOME,
  ARENA_WORKSPACE_ROOT,
  isWorkspaceName,
  WORKSPACE_IMAGE_TYPES,
  type WorkspaceEntry,
  type WorkspaceListing,
} from "@null-protocol/shared";
import {
  listWorkspace,
  updateWorkspace,
  readWorkspaceText,
  readWorkspaceImage,
  importWorkspaceImage,
} from "../lib/api";
import {
  TextEditor,
  type EditorDocument,
} from "../components/Terminal/TextEditor";
import { useLocale } from "../lib/locale";

export function ArenaFiles() {
  const [path, setPath] = useState(ARENA_WORKSPACE_ROOT);
  return <Folder key={path} path={path} navigate={setPath} />;
}

function Folder({
  path,
  navigate,
}: {
  path: string;
  navigate: (path: string) => void;
}) {
  const { t } = useLocale();
  const [listing, setListing] = useState<WorkspaceListing>();
  const [reload, setReload] = useState(0);
  const [problem, setProblem] = useState("");
  const [editor, setEditor] = useState<EditorDocument | null>(null);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(
    null,
  );
  const [remove, setRemove] = useState<WorkspaceEntry | null>(null);
  const [create, setCreate] = useState<"note" | "folder" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const previewUrl = preview?.url;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  useEffect(() => {
    if (create) nameField.current?.focus();
  }, [create]);
  useEffect(() => {
    let active = true;
    void listWorkspace(path)
      .then((result) => {
        if (active) setListing(result);
      })
      .catch((err: unknown) => {
        if (active)
          setProblem(
            err instanceof Error
              ? err.message
              : "Falló la lectura de archivos.",
          );
      });
    return () => {
      active = false;
    };
  }, [path, reload]);
  function refresh() {
    setReload((value) => value + 1);
  }
  async function perform(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setProblem("");
    try {
      await action();
    } catch (err) {
      setProblem(
        err instanceof Error
          ? err.message
          : "La operación requiere un reintento.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const childPath = (name: string) => {
    const normalized = name.normalize("NFC");
    if (!isWorkspaceName(normalized))
      throw new Error("Usa nombres válidos de hasta 80 caracteres.");
    return path + "/" + normalized;
  };
  function open(entry: WorkspaceEntry) {
    if (entry.kind === "DIRECTORY") {
      navigate(entry.path);
      return;
    }
    void perform(async () => {
      if (entry.kind === "IMAGE") {
        const image = await readWorkspaceImage(entry.path);
        if (mounted.current)
          setPreview({
            name: entry.path.split("/").at(-1)!,
            url: URL.createObjectURL(image),
          });
      } else {
        const row = await readWorkspaceText(entry.path);
        setEditor({
          path: row.path,
          cwd: path,
          text: row.text,
          version: row.version,
          readOnly: !(row.mode & 0o200),
        });
      }
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!create) return;
    void perform(async () => {
      const target = childPath(name);
      if (create === "folder")
        await updateWorkspace({ type: "mkdir", path: target });
      else {
        const row = await updateWorkspace({
          type: "write",
          path: target,
          text: "",
          version: null,
        });
        if (row)
          setEditor({
            path: target,
            cwd: path,
            text: "",
            version: row.version,
            readOnly: false,
          });
      }
      setCreate(null);
      setName("");
      refresh();
    });
  }
  function begin(kind: "note" | "folder") {
    setCreate(kind);
    setName("");
    setRemove(null);
    setProblem("");
  }
  return (
    <section className="arena-files" aria-labelledby="personal-files-title">
      <h2 id="personal-files-title">{t("Archivos personales")}</h2>
      <p>
        <code>{path.replace(ARENA_HOME, "~")}</code>
      </p>
      <div className="file-actions">
        {path !== ARENA_WORKSPACE_ROOT && (
          <button
            disabled={busy}
            onClick={() => navigate(path.slice(0, path.lastIndexOf("/")))}
          >
            {t("Carpeta anterior")}
          </button>
        )}
        <button disabled={busy} onClick={() => begin("note")}>
          {t("Nueva nota")}
        </button>
        <button disabled={busy} onClick={() => begin("folder")}>
          {t("Nueva carpeta")}
        </button>
        <button disabled={busy} onClick={() => file.current?.click()}>
          {t("Importar imagen")}
        </button>
        <input
          ref={file}
          type="file"
          hidden
          accept={WORKSPACE_IMAGE_TYPES.join(",")}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (selected)
              void perform(async () => {
                await importWorkspaceImage(childPath(selected.name), selected);
                refresh();
              });
          }}
        />
        <button
          disabled={busy}
          onClick={() => {
            setProblem("");
            refresh();
          }}
        >
          {t("Actualizar")}
        </button>
      </div>
      {problem && <p role="alert">{t(problem)}</p>}
      {create && (
        <form className="file-actions" onSubmit={submit}>
          <label>
            {t(
              create === "note" ? "Nombre de la nota" : "Nombre de la carpeta",
            )}{" "}
            <input
              ref={nameField}
              maxLength={80}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button disabled={busy || !name} type="submit">
            {t("Crear")}
          </button>
          <button disabled={busy} type="button" onClick={() => setCreate(null)}>
            {t("Cancelar")}
          </button>
        </form>
      )}
      {!listing && !problem && <p role="status">{t("Cargando…")}</p>}
      {listing &&
        (listing.entries.length ? (
          <ul>
            {listing.entries.map((entry) => {
              const label = entry.path.split("/").at(-1)!;
              return (
                <li key={entry.path}>
                  <button disabled={busy} onClick={() => open(entry)}>
                    {label}
                    {entry.kind === "DIRECTORY" ? "/" : ""}
                  </button>{" "}
                  <button
                    disabled={busy}
                    aria-label={t("Eliminar {name}", { name: label })}
                    onClick={() => {
                      setRemove(entry);
                      setCreate(null);
                    }}
                  >
                    {t("Eliminar")}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{t("Esta carpeta está vacía.")}</p>
        ))}
      {remove && (
        <div
          className="file-actions"
          role="group"
          aria-label={t("Confirmar eliminación")}
        >
          <p>
            {t("¿Eliminar {name}?", { name: remove.path.split("/").at(-1)! })}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await updateWorkspace({
                  type: "remove",
                  path: remove.path,
                  version: remove.version,
                  kind: remove.kind === "DIRECTORY" ? "directory" : "file",
                });
                setRemove(null);
                refresh();
              })
            }
          >
            {t("Confirmar eliminación")}
          </button>
          <button disabled={busy} onClick={() => setRemove(null)}>
            {t("Cancelar")}
          </button>
        </div>
      )}
      {preview && (
        <figure>
          <img className="file-preview" src={preview.url} alt={preview.name} />
          <figcaption>{preview.name}</figcaption>
          <button type="button" onClick={() => setPreview(null)}>
            {t("Cerrar imagen")}
          </button>
        </figure>
      )}
      {editor && (
        <TextEditor
          document={editor}
          workspaceRoot={ARENA_WORKSPACE_ROOT}
          home={ARENA_HOME}
          onClose={() => {
            setEditor(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}
