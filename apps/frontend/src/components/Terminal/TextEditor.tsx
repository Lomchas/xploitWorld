import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { WORKSPACE_LIMITS, WORKSPACE_ROOT } from "@null-protocol/shared";
import { ApiError, updateWorkspace } from "../../lib/api";
import { useLocale } from "../../lib/locale";
import { editorPath } from "./editor-command";

import "./Terminal.css";

export interface EditorDocument {
  path: string | null;
  cwd: string;
  text: string;
  version: string | null;
  readOnly: boolean;
}

export function TextEditor({
  document: initial,
  onClose,
  workspaceRoot = WORKSPACE_ROOT,
  home,
}: {
  document: EditorDocument;
  onClose: (savedPath?: string) => void;
  workspaceRoot?: string;
  home?: string;
}) {
  const { t } = useLocale();
  const modal = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelExit = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const lastSave = useRef<string>();
  const cut = useRef("");
  const [file, setFile] = useState(initial);
  const [text, setText] = useState(initial.text);
  const [name, setName] = useState("");
  const [dialog, setDialog] = useState<"edit" | "name" | "exit">("edit");
  const [closeAfterSave, setCloseAfterSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const dirty = text !== file.text;
  const bytes = new TextEncoder().encode(text).length;

  useEffect(() => {
    const element = modal.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (dialog === "name") {
      nameInput.current?.focus();
      nameInput.current?.select();
    } else if (dialog === "exit") cancelExit.current?.focus();
    else area.current?.focus();
  }, [dialog]);

  useEffect(() => {
    if (!dirty && !busy) return;
    const confirm = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirm);
    return () => window.removeEventListener("beforeunload", confirm);
  }, [dirty, busy]);

  const exit = (): void => {
    if (saving.current) return;
    if (dirty) setDialog("exit");
    else onClose(lastSave.current);
  };
  const save = async (
    target: string,
    version: string | null,
    leave: boolean,
  ): Promise<void> => {
    if (saving.current) return;
    if (!target.startsWith(workspaceRoot + "/")) {
      setFeedback({
        error: true,
        text: t("El destino debe estar dentro de {root}.", {
          root: workspaceRoot,
        }),
      });
      return;
    }
    if (bytes > WORKSPACE_LIMITS.fileTextBytes) {
      setFeedback({
        error: true,
        text: t("El archivo supera el límite de 16 KiB."),
      });
      return;
    }
    saving.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await updateWorkspace({
        type: "write",
        path: target,
        text,
        version,
      });
      if (!saved) throw new Error("No se pudo guardar el archivo.");
      lastSave.current = saved.path;
      if (leave) onClose(saved.path);
      else {
        setFile({
          ...file,
          path: saved.path,
          text,
          version: saved.version,
          readOnly: false,
        });
        setFeedback({ error: false, text: t("Archivo guardado.") });
        setDialog("edit");
      }
    } catch (error: unknown) {
      setFeedback({
        error: true,
        text:
          error instanceof ApiError && error.status === 409
            ? t(
                "El archivo cambió o el nombre ya existe. Guarda una copia con otro nombre.",
              )
            : t(
                error instanceof Error
                  ? error.message
                  : "No se pudo guardar el archivo.",
              ),
      });
      if (dialog === "exit") setDialog("edit");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const saveRequest = (leave = false, copy = false): void => {
    if (saving.current) return;
    if (!copy && file.path && !file.readOnly) {
      void save(file.path, file.version, leave);
      return;
    }
    setFeedback(null);
    setName(copy || file.readOnly ? "" : (file.path ?? ""));
    setCloseAfterSave(leave);
    setDialog("name");
  };

  const replaceSelection = (
    start: number,
    end: number,
    replacement: string,
  ): void => {
    const input = area.current;
    if (!input || busy || file.readOnly) return;
    input.setRangeText(replacement, start, end, "end");
    setText(input.value);
  };
  const onKey = (event: KeyboardEvent<HTMLDialogElement>): void => {
    if (event.nativeEvent.isComposing || event.altKey) return;
    const control = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (control && key === "o") {
      event.preventDefault();
      if (dialog === "edit") saveRequest(false, event.shiftKey);
    } else if (
      control &&
      key === "x" &&
      !event.shiftKey &&
      event.target !== nameInput.current
    ) {
      // Ctrl+X exits in Nano. Native cut is available as Ctrl+Shift+X or Ctrl+K.
      event.preventDefault();
      if (dialog === "edit") exit();
      else if (!busy) setDialog("edit");
    } else if (
      control &&
      (key === "k" || key === "u" || (event.shiftKey && key === "x")) &&
      event.target === area.current
    ) {
      const input = area.current;
      if (!input) return;
      event.preventDefault();
      if (busy || file.readOnly) return;
      let { selectionStart: start, selectionEnd: end } = input;
      if (key === "u") {
        if (cut.current) replaceSelection(start, end, cut.current);
        return;
      }
      if (key === "k" && start === end) {
        start = start ? text.lastIndexOf("\n", start - 1) + 1 : 0;
        const newline = text.indexOf("\n", end);
        end = newline === -1 ? text.length : newline + 1;
      }
      if (start === end) return;
      cut.current = text.slice(start, end);
      void navigator.clipboard?.writeText(cut.current).catch(() => undefined);
      replaceSelection(start, end, "");
    }
  };

  return (
    <dialog
      ref={modal}
      className="terminal-editor"
      aria-labelledby="editor-title"
      onKeyDown={onKey}
      onCancel={(event) => {
        event.preventDefault();
        if (saving.current) return;
        if (dialog === "edit") exit();
        else setDialog("edit");
      }}
    >
      <header className="editor-header">
        <h2 id="editor-title">
          {t("Editor de texto")} <code>echo</code>
        </h2>
        <span>
          {file.path ?? t("Sin título")}
          {dirty ? " *" : ""}
        </span>
      </header>
      <textarea
        ref={area}
        aria-label={t("Contenido del archivo")}
        value={text}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        readOnly={file.readOnly || busy || dialog !== "edit"}
        onChange={(event) => setText(event.target.value)}
      />
      <div
        className="editor-status"
        role={feedback?.error ? "alert" : "status"}
      >
        <span>
          {feedback?.text ??
            (file.readOnly ? t("Solo lectura") : busy ? t("Guardando…") : "")}
        </span>
        <span>
          {t("{lines} líneas · {bytes} bytes", {
            lines: text.split("\n").length,
            bytes,
          })}
        </span>
      </div>
      {dialog === "name" && (
        <form
          className="editor-question"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim())
              void save(
                editorPath(name.trim(), file.cwd, workspaceRoot, home),
                null,
                closeAfterSave,
              );
          }}
        >
          <label htmlFor="editor-name">{t("Ruta del archivo")}</label>
          <input
            ref={nameInput}
            id="editor-name"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("nota.txt")}
            required
          />
          <button type="submit" disabled={busy}>
            {t("Guardar")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog("edit")}
          >
            {t("Cancelar")}
          </button>
        </form>
      )}
      {dialog === "exit" && (
        <div
          className="editor-question"
          role="group"
          aria-label={t("Cambios sin guardar")}
        >
          <span>{t("¿Guardar los cambios antes de salir?")}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => saveRequest(true)}
          >
            {t("Guardar y salir")}
          </button>
          <button type="button" disabled={busy} onClick={() => onClose()}>
            {t("Descartar cambios")}
          </button>
          <button
            type="button"
            ref={cancelExit}
            disabled={busy}
            onClick={() => setDialog("edit")}
          >
            {t("Cancelar")}
          </button>
        </div>
      )}
      {dialog === "edit" && (
        <footer className="editor-actions">
          <button type="button" disabled={busy} onClick={() => saveRequest()}>
            <kbd>Ctrl+O</kbd> {t("Guardar")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => saveRequest(false, true)}
          >
            {t("Guardar como")}
          </button>
          <button type="button" disabled={busy} onClick={exit}>
            <kbd>Ctrl+X</kbd> {t("Salir")}
          </button>
          <span>
            <kbd>Ctrl+K</kbd> {t("Cortar")} · <kbd>Ctrl+U</kbd> {t("Pegar")}
          </span>
        </footer>
      )}
    </dialog>
  );
}
