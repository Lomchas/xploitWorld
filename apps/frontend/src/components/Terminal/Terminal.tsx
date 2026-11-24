import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import "./Terminal.css";
import { useHistory } from "./useHistory";
import { autocomplete } from "./useAutocomplete";
import {
  terminalThemes,
  terminalFontStack,
  TERMINAL_LINE_HEIGHT,
} from "../../lib/theme";
import {
  ensureGuestSession,
  fetchLevels,
  fetchAccount,
  fetchExchange,
  fetchLevelBySlug,
  fetchUserProgress,
  ApiError,
  importWorkspaceImage,
  readWorkspaceText,
  readWorkspaceImage,
  submitFlag,
} from "../../lib/api";
import { getWsClient } from "../../lib/ws-client";
import { readFontSize, readTerminalPreferences } from "../../lib/preferences";
import {
  formatPvpBtc,
  CATALOG,
  type Sku,
  campaignMission,
  MAX_COMMAND_LENGTH,
  MISSIONS,
  prerequisiteSlugs,
  resolveVirtualPath,
  tokenizeCommand,
  VIRTUAL_HOME,
  WORKSPACE_IMAGE_TYPES,
  WORKSPACE_ROOT,
} from "@null-protocol/shared";
import { cursorStep, visibleInput } from "./editable-line";
import { bindTerminalClipboard } from "./clipboard";
import { editorCommand, editorPath } from "./editor-command";
import { TextEditor, type EditorDocument } from "./TextEditor";
import { useLocale } from "../../lib/locale";

// eslint-disable-next-line no-control-regex -- Remote output must not contain terminal control bytes.
const OUTPUT_CONTROLS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;
// eslint-disable-next-line no-control-regex -- Pasted input must not execute control keys.
const INPUT_CONTROLS = /[\x00-\x1f\x7f-\x9f]/;

interface TerminalProps {
  wsUrl: string;
  initialMission?: string;
}
export function Terminal({ wsUrl, initialMission }: TerminalProps) {
  const { t, locale } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const closeEditor = useRef<(savedPath?: string) => void>(() => undefined);
  const [neededItem, setNeededItem] = useState<Sku | null>(null);
  const [editor, setEditor] = useState<EditorDocument | null>(null);
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(
    null,
  );
  const [upload, setUpload] = useState<{
    path: string;
    error?: string;
    busy?: boolean;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const previewUrl = preview?.url;
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  const history = useHistory();
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const preferences = readTerminalPreferences();
    const term = new XTerm({
      fontFamily: terminalFontStack,
      fontSize: readFontSize(),
      lineHeight: TERMINAL_LINE_HEIGHT,
      theme: terminalThemes[preferences.theme],
      cursorBlink: preferences.blink,
      cursorStyle: preferences.cursor,
      scrollback: 2000,
      screenReaderMode: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    term.textarea?.setAttribute("aria-label", t("Entrada de la terminal"));
    const resize = (): void => {
      if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const client = getWsClient(wsUrl);
    const autoResume =
      locale === "en" ? "mission continue" : "mission continuar";
    let resume = initialMission ? "mission " + initialMission : autoResume;
    let disposed = false;
    let busy = true;
    let ready = false;
    let editing = false;
    let queued: string | null = null;
    let buffer = "";
    let cursor = 0;
    let cwd = VIRTUAL_HOME;
    const prompt = (): string =>
      `guest@xploitworld:${cwd === VIRTUAL_HOME ? "~" : cwd}$ `;
    // Database descriptions and remote messages are plain text, never terminal control sequences.
    const write = (text: string): void => {
      if (!disposed)
        term.write(text.replace(OUTPUT_CONTROLS, "").replace(/\r?\n/g, "\r\n"));
    };
    const showPrompt = (): void => {
      if (!disposed) {
        redraw();
        busy = false;
        if (queued && !editing && !buffer) {
          const next = queued;
          queued = null;
          runCommand(next);
        }
      }
    };
    const execute = async (raw: string): Promise<void> => {
      const [command, ...args] = raw.trim().split(/\s+/);
      if (command === "clear") {
        term.clear();
        return;
      }
      if (command === "history") {
        write(
          history.commands
            .map((value, index) => `${index + 1}  ${value}`)
            .join("\n") + "\n",
        );
        return;
      }
      const edit = editorCommand(raw);
      if (edit) {
        const path = edit.name ? editorPath(edit.name, cwd) : null;
        if (path && !path.startsWith(WORKSPACE_ROOT + "/")) {
          write(t("El destino debe estar dentro de ~/trabajo.") + "\n");
          return;
        }
        const existing = path
          ? await readWorkspaceText(path).catch((error: unknown) => {
              if (error instanceof ApiError && error.status === 404)
                return null;
              throw error;
            })
          : null;
        if (disposed) return;
        editing = true;
        setEditor({
          path,
          cwd,
          text: existing?.text ?? "",
          version: existing?.version ?? null,
          readOnly: existing ? (existing.mode & 0o200) === 0 : false,
        });
        return;
      }
      if (command === "status") {
        const [account, exchange] = await Promise.all([
          fetchAccount(),
          fetchExchange(),
        ]);
        write(
          t("Operador: ") +
            account.username +
            t("\nBilletera: ") +
            (account.balanceSats === null
              ? t("sin despliegue")
              : formatPvpBtc(account.balanceSats) +
                " " +
                t("BTC de Historia")) +
            (exchange.inventory.some(
              (item) => item.sku === "case" && item.state === "EQUIPPED",
            )
              ? "\n◆ " + t(CATALOG.case.name)
              : "") +
            "\n",
        );
        return;
      }
      if (command === "levels" || command === "listar_operaciones") {
        const chapter = args[0];
        if (
          args.length > 1 ||
          (chapter && !/^(tutorial|[1-6])$/.test(chapter))
        ) {
          write(t("Uso: levels [tutorial|1–6]\n"));
          return;
        }
        const [levels, progress] = await Promise.all([
          fetchLevels(),
          fetchUserProgress(),
        ]);
        const completed = new Set(
          progress
            .filter((entry) => entry.completed)
            .map((entry) => entry.level.slug),
        );
        for (const level of levels) {
          const mission = campaignMission(level.slug);
          if (
            chapter &&
            (mission ? String(mission.chapter) : "tutorial") !== chapter
          )
            continue;
          const unlocked = prerequisiteSlugs(level.slug).every((slug) =>
            completed.has(slug),
          );
          const status = completed.has(level.slug) ? "✓" : unlocked ? " " : "×";
          write(
            "[" +
              status +
              "] " +
              level.orderIndex +
              ". " +
              t(level.name) +
              " · " +
              t(
                {
                  EASY: "Fácil",
                  MEDIUM: "Media",
                  HARD: "Difícil",
                  EXPERT: "Experto",
                  NIGHTMARE: "Pesadilla",
                }[level.difficulty],
              ) +
              "\n    " +
              (mission?.code ?? level.slug) +
              "\n",
          );
        }
        write(
          t(
            "\nAbre un escenario con mission <código|slug> o mission continuar.\n",
          ),
        );
        return;
      }
      if (
        command === "submit" &&
        args.length === 2 &&
        !campaignMission(args[0]!)
      ) {
        const level = await fetchLevelBySlug(args[0]!);
        const submission = await submitFlag(level.id, args[1]!);
        write(
          submission.accepted
            ? t("[+] Nivel completado: {v1}\n", { v1: t(level.name) })
            : t("[-] Flag incorrecta. Sigue investigando.\n"),
        );
        if (submission.accepted) {
          resume = autoResume;
          window.dispatchEvent(new Event("xwd:progress"));
          const current = MISSIONS.findIndex(
            (mission) => mission.slug === level.slug,
          );
          const next = current === -1 ? undefined : MISSIONS[current + 1];
          if (next)
            write(
              t("Siguiente escenario: mission ") +
                (campaignMission(next.slug)?.code ?? next.slug) +
                "\n",
            );
        }
        return;
      }
      if (command === "progress") {
        const [levels, progress] = await Promise.all([
          fetchLevels(),
          fetchUserProgress(),
        ]);
        const ids = new Set(levels.map((level) => level.id));
        const done = progress.filter(
          (entry) => ids.has(entry.levelId) && entry.completed,
        ).length;
        write(
          t("Progreso: {done}/{v2} niveles completados\n", {
            done,
            v2: levels.length,
          }),
        );
        return;
      }
      if (command === "import") {
        const parsed = tokenizeCommand(raw);
        if (parsed.error || parsed.args.length !== 1) {
          write(
            (parsed.error
              ? t(parsed.error)
              : t("Uso: {command} <ruta en ~/trabajo>", { command })) + "\n",
          );
          return;
        }
        const path = resolveVirtualPath(parsed.args[0]!, cwd);
        if (!path.startsWith(WORKSPACE_ROOT + "/")) {
          write(t("El destino debe estar dentro de ~/trabajo.\n"));
          return;
        }
        setNotice("");
        setUpload({ path });
        return;
      }
      const response = await client.execute(raw, locale);
      cwd = response.cwd;
      if (
        (command === "mission" || command === "branch") &&
        args.length === 1 &&
        response.exitCode === 0
      )
        resume = raw;
      if (response.progressChanged) resume = autoResume;
      if (response.requiredItem) setNeededItem(response.requiredItem);
      else if (command === "mission" && response.exitCode === 0)
        setNeededItem(null);
      if (response.output) write(response.output + "\n");
      if (response.progressChanged)
        window.dispatchEvent(new Event("xwd:progress"));
      if (response.imagePath) {
        const image = await readWorkspaceImage(response.imagePath);
        if (!disposed)
          setPreview({
            path: response.imagePath,
            url: URL.createObjectURL(image),
          });
      }
    };
    const redraw = (): void => {
      const { line, before } = visibleInput(
        prompt(),
        buffer,
        cursor,
        term.cols,
      );
      term.write("\r\x1b[2K" + line + "\r" + before);
    };
    const inputAtEnd = (value: string): void => {
      buffer = value;
      cursor = value.length;
      redraw();
    };
    const executeLine = (raw: string, remember: boolean): void => {
      busy = true;
      if (remember) history.add(raw);
      void execute(raw)
        .catch((error: unknown) => {
          write(
            `[-] ${t(error instanceof Error ? error.message : "Error inesperado")}\n`,
          );
        })
        .finally(showPrompt);
    };
    const runCommand = (raw: string, focus = false): void => {
      if (disposed) return;
      if (busy || editing || buffer) {
        queued = raw;
        return;
      }
      if (focus) term.focus();
      term.write("\r\x1b[2K" + prompt() + raw + "\r\n");
      executeLine(raw, false);
    };
    closeEditor.current = (savedPath) => {
      editing = false;
      setEditor(null);
      if (savedPath) {
        term.write("\r\x1b[2K");
        write(t("Archivo guardado en {path}.", { path: savedPath }) + "\n");
      }
      showPrompt();
      window.requestAnimationFrame(() => {
        if (!disposed) term.focus();
      });
    };
    const stopResume = client.on("open", () => {
      if (ready) runCommand(resume);
    });
    const resizeListener = term.onResize(() => {
      if (!busy) redraw();
    });
    const insert = (data: string): void => {
      if (
        !data ||
        INPUT_CONTROLS.test(data) ||
        buffer.length + data.length > MAX_COMMAND_LENGTH
      )
        return;
      buffer = buffer.slice(0, cursor) + data + buffer.slice(cursor);
      cursor += data.length;
      redraw();
    };
    const unbindClipboard = bindTerminalClipboard(term, container, {
      getLine: () => buffer,
      replaceLine: inputAtEnd,
      insert,
      isBusy: () => busy || editing || disposed,
    });
    const dataListener = term.onData((data) => {
      if (busy || editing || disposed) return;
      if (data === "\x03") {
        term.write("\r\x1b[2K" + prompt() + buffer + "^C\r\n");
        buffer = "";
        cursor = 0;
        history.resetPointer();
        showPrompt();
        return;
      }
      if (data === "\x0c") {
        term.clear();
        redraw();
        return;
      }
      if (data === "\r" || data === "\n") {
        const raw = buffer.trim();
        term.write("\r\x1b[2K" + prompt() + buffer + "\r\n");
        buffer = "";
        cursor = 0;
        if (!raw) {
          showPrompt();
          return;
        }
        executeLine(raw, true);
        return;
      }
      if (data === "\x1b[D" || data === "\x1b[C") {
        cursor = cursorStep(buffer, cursor, data === "\x1b[D" ? -1 : 1);
        redraw();
        return;
      }
      if (
        data === "\x1b[H" ||
        data === "\x01" ||
        data === "\x1b[F" ||
        data === "\x05"
      ) {
        cursor = data === "\x1b[H" || data === "\x01" ? 0 : buffer.length;
        redraw();
        return;
      }
      if (data === "\x7f" || data === "\b") {
        const previous = cursorStep(buffer, cursor, -1);
        buffer = buffer.slice(0, previous) + buffer.slice(cursor);
        cursor = previous;
        redraw();
        return;
      }
      if (data === "\x1b[3~") {
        buffer =
          buffer.slice(0, cursor) + buffer.slice(cursorStep(buffer, cursor, 1));
        redraw();
        return;
      }
      if (data === "\x1b[A") {
        inputAtEnd(history.navigateUp() ?? buffer);
        return;
      }
      if (data === "\x1b[B") {
        inputAtEnd(history.navigateDown() ?? "");
        return;
      }
      if (data === "\t" && cursor === buffer.length) {
        const matches = autocomplete(buffer, false, locale);
        if (matches.length === 1) inputAtEnd(matches[0]!);
        else if (matches.length > 1) {
          write("\n" + matches.join("  ") + "\n");
          redraw();
        }
        return;
      }
      insert(data);
    });
    term.writeln("\x1b[1;93m[XploitworlD]\x1b[0m " + t("Modo Historia"));
    write(t("help para ver comandos · echo <archivo> para editar") + "\n");
    write(
      t("Ctrl+Mayús+C copia · Ctrl+X corta el comando · Ctrl+V pega") + "\n\n",
    );
    void ensureGuestSession()
      .then(async () => {
        if (disposed) return;
        const levels = await fetchLevels();
        if (disposed) return;
        if (levels.length < MISSIONS.length)
          write(
            t(
              "Para cargar la campaña completa, ejecuta pnpm db:setup en el proyecto.",
            ) + "\n",
          );
        ready = true;
        if (client.getStatus() === "open") queued ??= resume;
        if (client.getStatus() !== "open") client.connect();
      })
      .catch((error: unknown) => {
        write(
          t("No se pudo iniciar la sesión: {message}", {
            message: t(
              error instanceof Error ? error.message : "API no disponible",
            ),
          }) + "\n\n",
        );
      })
      .finally(() => {
        showPrompt();
        if (
          !disposed &&
          matchMedia("(pointer: fine)").matches &&
          document.activeElement === document.getElementById("main")
        )
          term.focus();
      });
    return () => {
      disposed = true;
      stopResume();
      unbindClipboard();
      observer.disconnect();
      dataListener.dispose();
      resizeListener.dispose();
      term.dispose();
    };
  }, [wsUrl, history, locale, t, initialMission]);
  return (
    <>
      {neededItem && (
        <div className="terminal-equipment">
          <Link to={"/exchange?articulo=" + neededItem}>
            {t("Ver {name} en Exchange", { name: t(CATALOG[neededItem].name) })}
          </Link>
          <Link to="/exchange?panel=recompensas">{t("Ganar BTC")}</Link>
        </div>
      )}
      <div
        className="terminal-container"
        ref={containerRef}
        role="region"
        aria-label={t("Terminal de Historia")}
      />
      {editor && (
        <TextEditor
          document={editor}
          onClose={(path) => closeEditor.current(path)}
        />
      )}
      {preview && (
        <section
          className="terminal-document"
          aria-label={t("Vista de imagen")}
        >
          <div>
            <code>{preview.path}</code>{" "}
            <button type="button" onClick={() => setPreview(null)}>
              {t("Cerrar imagen")}
            </button>
          </div>
          <img src={preview.url} alt={preview.path.split("/").at(-1)} />
        </section>
      )}
      {upload && (
        <section
          className="terminal-document"
          aria-label={t("Importar imagen")}
        >
          <label>
            {t("Selecciona una imagen para ")}
            <code>{upload.path}</code>
            <input
              type="file"
              accept={WORKSPACE_IMAGE_TYPES.join(",")}
              disabled={upload.busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setUpload({ path: upload.path, busy: true });
                void importWorkspaceImage(upload.path, file)
                  .then(() => {
                    setUpload(null);
                    setNotice(t("Imagen guardada en ") + upload.path);
                  })
                  .catch((error: unknown) =>
                    setUpload({
                      path: upload.path,
                      error:
                        error instanceof Error
                          ? error.message
                          : t("No se pudo importar."),
                    }),
                  );
              }}
            />
          </label>
          <button
            type="button"
            disabled={upload.busy}
            onClick={() => setUpload(null)}
          >
            {t("Cancelar")}
          </button>
          {upload.error && <p role="alert">{t(upload.error)}</p>}
        </section>
      )}
      {notice && (
        <p className="terminal-document" role="status">
          {t(notice)}
        </p>
      )}
    </>
  );
}
