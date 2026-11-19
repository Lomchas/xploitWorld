import type { Terminal } from "@xterm/xterm";
import { MAX_COMMAND_LENGTH } from "@null-protocol/shared";

// Clipboard data is always input. Line breaks never submit a command.
// eslint-disable-next-line no-control-regex -- Strip terminal control bytes.
const controls = /[\x00-\x1f\x7f-\x9f]/g;

export function plainCommandPaste(text: string): string {
  return text
    .slice(0, MAX_COMMAND_LENGTH * 2)
    .replace(/\s+/gu, (match) => (/[\r\n\t]/.test(match) ? " " : match))
    .replace(controls, "");
}

export function bindTerminalClipboard(
  terminal: Terminal,
  container: HTMLElement,
  input: {
    getLine: () => string;
    replaceLine: (value: string) => void;
    insert: (value: string) => void;
    isBusy: () => boolean;
  },
): () => void {
  let clipboard = "";
  let disposed = false;

  const paste = (text: string): void => {
    if (!disposed && !input.isBusy()) input.insert(plainCommandPaste(text));
  };
  const copy = (text: string): void => {
    clipboard = text;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  const pasteEvent = (event: ClipboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    paste(event.clipboardData?.getData("text/plain") ?? "");
  };
  const cutEvent = (event: ClipboardEvent): void => {
    if (!event.clipboardData || input.isBusy() || !input.getLine()) return;
    event.preventDefault();
    clipboard = input.getLine();
    event.clipboardData.setData("text/plain", clipboard);
    input.replaceLine("");
  };

  container.addEventListener("paste", pasteEvent, true);
  container.addEventListener("cut", cutEvent, true);
  terminal.attachCustomKeyEventHandler((event) => {
    const primary = (event.ctrlKey || event.metaKey) && !event.altKey;
    const key = event.key.toLowerCase();
    const shortcut = primary && ["c", "v", "x"].includes(key);
    const insert = event.shiftKey && key === "insert";
    if (!shortcut && !insert) return true;
    if (event.type !== "keydown") return false;
    if (primary && key === "c") {
      const selected = terminal.getSelection();
      if (!selected && !event.shiftKey && !event.metaKey) return true;
      event.preventDefault();
      const text = selected || input.getLine();
      if (text) copy(text);
      return false;
    }
    if (primary && key === "x") {
      event.preventDefault();
      if (!input.isBusy() && input.getLine()) {
        copy(input.getLine());
        input.replaceLine("");
      }
      return false;
    }
    if (insert || (key === "v" && event.shiftKey)) {
      event.preventDefault();
      const access = navigator.clipboard;
      if (access) void access.readText().then(paste, () => paste(clipboard));
      else paste(clipboard);
    }
    // The native paste event supports Ctrl/Cmd+V even with clipboard reads blocked.
    return false;
  });

  return () => {
    disposed = true;
    container.removeEventListener("paste", pasteEvent, true);
    container.removeEventListener("cut", cutEvent, true);
  };
}
