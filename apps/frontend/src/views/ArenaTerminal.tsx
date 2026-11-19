import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ARENA_HOME,
  MAX_COMMAND_LENGTH,
  ARENA_WORKSPACE_ROOT,
  tokenizeCommand,
  resolveVirtualPath,
} from "@null-protocol/shared";
import {
  ApiError,
  listWorkspace,
  readWorkspaceText,
  updateWorkspace,
} from "../lib/api";
import { usePvpWorld } from "../hooks/usePvpWorld";
import { useLocale } from "../lib/locale";
import {
  editorCommand,
  editorPath,
} from "../components/Terminal/editor-command";
import {
  TextEditor,
  type EditorDocument,
} from "../components/Terminal/TextEditor";
import { useHistory } from "../components/Terminal/useHistory";
import "./ArenaDesktop.css";

export function ArenaTerminal({ wsUrl }: { wsUrl: string }) {
  const { t } = useLocale();
  const location = useLocation();
  const initial = (location.state as { file?: string } | null)?.file;
  const { state, readError, refresh } = usePvpWorld(wsUrl, 0, "");
  const self = state?.self;
  const host = self?.hostname ?? "arena-lab";
  const prompt = (cwd: string) =>
    (self?.alias ?? "operator") +
    "@" +
    host +
    ":" +
    cwd.replace(ARENA_HOME, "~") +
    "$";
  const [cwd, setCwd] = useState(ARENA_WORKSPACE_ROOT);
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLPreElement>(null);
  const history = useHistory("pvp");
  const append = (line: string) =>
    setEntries((previous) => [...previous.slice(-59), line]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [entries]);
  useEffect(() => {
    if (initial) setInput("echo " + JSON.stringify(initial));
  }, [initial]);

  const execute = async (raw: string) => {
    const parsed = tokenizeCommand(raw);
    if (parsed.error) throw new Error(parsed.error);
    const { command, args, flags, redirect } = parsed;
    const path = (name: string) => resolveVirtualPath(name, cwd, ARENA_HOME);
    const edit = editorCommand(raw);
    if (edit) {
      const target = edit.name
        ? editorPath(edit.name, cwd, ARENA_WORKSPACE_ROOT, ARENA_HOME)
        : null;
      const existing = target
        ? await readWorkspaceText(target).catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
          })
        : null;
      setEditor({
        path: target,
        cwd,
        text: existing?.text ?? "",
        version: existing?.version ?? null,
        readOnly: Boolean(existing && !(existing.mode & 0o200)),
      });
      return "";
    }
    if (redirect && command !== "echo")
      throw new Error("Usa echo para escribir un archivo.");
    if (raw.length > MAX_COMMAND_LENGTH) throw new Error("Comando inválido.");
    if (command === "clear") {
      setEntries([]);
      return "";
    }
    if (command === "pwd") return cwd;
    if (command === "ls" && args.length > 1)
      throw new Error("Consulta help para ver los comandos de tu equipo.");
    if (command === "whoami") return self?.alias ?? "";
    if (command === "hostname") return host;
    if (command === "history") return history.commands.join("\n");
    if (command === "help")
      return t(
        "Archivos: pwd, ls, cd, cat, mkdir, touch, rm, rmdir, echo. Equipo: whoami, hostname, ip addr, status, apps. Bitácora: export-log <archivo>.",
      );
    if (command === "apps")
      return t(
        "Terminal · Archivos · Editor · Bitácora · Diagnóstico de red · Contratos",
      );
    if (command === "status")
      return t("Integridad {value}% · energía {energy} · arena {region}", {
        value: self?.integrity ?? 0,
        energy: self?.energy ?? 0,
        region: self?.regionId ?? "",
      });
    if (command === "ip" && args[0] === "addr")
      return ["vnet0", self?.ipv4, self?.address].filter(Boolean).join("\n");
    if (command === "ls" || command === "cd") {
      const requested = args[0]
        ? path(args[0])
        : command === "cd"
          ? ARENA_WORKSPACE_ROOT
          : cwd;
      const target =
        requested === ARENA_HOME ? ARENA_WORKSPACE_ROOT : requested;
      const listing = await listWorkspace(target);
      if (command === "cd") {
        setCwd(target);
        return "";
      }
      return listing.entries
        .map((entry) => {
          const name =
            entry.path.split("/").at(-1) +
            (entry.kind === "DIRECTORY" ? "/" : "");
          return flags.l ? entry.mode.toString(8) + "  " + name : name;
        })
        .join("\n");
    }
    const [name] = args;
    if (command === "echo") {
      const value = args.join(" ") + (flags.n ? "" : "\n");
      if (redirect) {
        await updateWorkspace({
          type: "write",
          path: path(redirect.path),
          text: value,
          append: redirect.append,
        });
        return "";
      }
      return value;
    }
    if (!name || args.length !== 1)
      throw new Error("Consulta help para ver los comandos de tu equipo.");
    const target = path(name);
    switch (command) {
      case "cat":
        return (await readWorkspaceText(target)).text;
      case "mkdir":
      case "touch":
        await updateWorkspace({ type: command, path: target });
        return "";
      case "rm":
      case "rmdir":
        await updateWorkspace({
          type: "remove",
          path: target,
          kind: command === "rm" ? "file" : "directory",
        });
        return "";
      case "export-log": {
        const logs = (state?.events ?? []).slice(0, 30).reverse();
        if (!logs.length) return t("No hay eventos recientes de PvP.");
        const text =
          logs
            .map((event) => event.createdAt + " · " + t(event.message))
            .join("\n") + "\n";
        await updateWorkspace({
          type: "write",
          path: target,
          text,
          version: null,
        });
        return t("Registro guardado en {path}.", { path: target });
      }
      default:
        throw new Error("Consulta help para ver los comandos de tu equipo.");
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = input.trim();
    if (!self || busy || !raw) return;
    setBusy(true);
    setInput("");
    history.add(raw);
    append(prompt(cwd) + " " + raw);
    try {
      const output = await execute(raw);
      if (output) append(output);
    } catch (error) {
      append(t(error instanceof Error ? error.message : "Comando inválido."));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => field.current?.focus());
    }
  };
  return (
    <section className="arena-terminal" aria-label={t("Terminal multijugador")}>
      {readError && (
        <p role="alert">
          {t(readError)}{" "}
          <button onClick={() => void refresh()}>{t("Reintentar")}</button>
        </p>
      )}
      {!self && <Link to="/pvp">{t("Abrir mi escritorio")}</Link>}
      <pre ref={scroll} role="log" aria-label={t("Salida de la terminal PVP")}>
        {entries.join("\n")}
      </pre>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="arena-input">
          <code>{prompt(cwd)}</code>
        </label>
        <input
          id="arena-input"
          ref={field}
          value={input}
          aria-label={t("Comando PVP")}
          maxLength={2000}
          spellCheck={false}
          autoComplete="off"
          disabled={!self}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const found =
              event.key === "ArrowUp"
                ? history.navigateUp()
                : history.navigateDown();
            setInput(found ?? "");
          }}
        />
        <button type="submit" disabled={!self || !input.trim() || busy}>
          {t("Ejecutar")}
        </button>
      </form>
      {editor && (
        <TextEditor
          document={editor}
          workspaceRoot={ARENA_WORKSPACE_ROOT}
          home={ARENA_HOME}
          onClose={(saved) => {
            if (saved)
              append(t("Archivo guardado en {path}.", { path: saved }));
            setEditor(null);
            requestAnimationFrame(() => field.current?.focus());
          }}
        />
      )}
    </section>
  );
}
