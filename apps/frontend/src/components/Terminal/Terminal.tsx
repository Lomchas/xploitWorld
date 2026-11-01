import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "xterm/css/xterm.css";
import { useHistory } from "./useHistory";
import { autocomplete } from "./useAutocomplete";
import {
  xtermTheme,
  terminalFontStack,
  TERMINAL_FONT_SIZE_DESKTOP,
  TERMINAL_LINE_HEIGHT,
} from "../../lib/theme";

const PROMPT = "root@nullprotocol:~# ";

interface TerminalProps {
  wsUrl: string;
}

export function Terminal({ wsUrl }: TerminalProps) {
  const termRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const bufferRef = useRef("");
  const [isProcessing, setIsProcessing] = useState(false);
  const history = useHistory();
  const historyRef = useRef(history);

  useEffect(() => {
    const container = termRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: terminalFontStack,
      fontSize: TERMINAL_FONT_SIZE_DESKTOP,
      lineHeight: TERMINAL_LINE_HEIGHT,
      theme: xtermTheme,
      allowProposedApi: true,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());

    term.open(container!);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    term.write(`\r\n${PROMPT}`);

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(container);

    const handleData = (data: string) => {
      if (isProcessing) return;

      const char = data.charCodeAt(0);

      // Ctrl+L: clear screen
      if (char === 0x0c) {
        term.clear();
        term.write(`\r\n${PROMPT}`);
        bufferRef.current = "";
        return;
      }

      // Ctrl+C: cancel line
      if (char === 0x03) {
        bufferRef.current = "";
        term.write("\r\n");
        term.write(`${PROMPT}`);
        historyRef.current.resetPointer();
        return;
      }

      // Enter
      if (char === 0x0d || char === 0x0a) {
        const cmd = bufferRef.current.trim();
        bufferRef.current = "";

        term.write("\r\n");

        if (cmd.length > 0) {
          historyRef.current.add(cmd);
          setIsProcessing(true);
          term.write(`\r\n[WS] sending: ${cmd}\r\n`);

          // Send via WebSocket
          const ws = new WebSocket(wsUrl);
          ws.onopen = () => {
            ws.send(
              JSON.stringify({
                type: "cmd",
                payload: { raw: cmd },
              }),
            );
          };
          ws.onmessage = (event) => {
            try {
              const parsed = JSON.parse(event.data) as {
                type: string;
                payload: { output: string };
              };
              if (parsed.type === "cmd_response") {
                term.write(`\r\n${parsed.payload.output}\r\n`);
              }
            } catch {
              term.write("\r\n[Error parsing response]\r\n");
            } finally {
              ws.close();
              setIsProcessing(false);
              term.write(`${PROMPT}`);
            }
          };
          ws.onerror = () => {
            term.write("\r\n[WS connection error]\r\n");
            ws.close();
            setIsProcessing(false);
            term.write(`${PROMPT}`);
          };
        } else {
          term.write(`${PROMPT}`);
        }
        return;
      }

      // Backspace
      if (char === 0x7f) {
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }

      // Arrow up
      if (data === "\x1b[A") {
        const prev = historyRef.current.navigateUp();
        if (prev !== undefined) {
          term.write("\r".repeat(term.cols ?? 80) + "\x1b[K");
          term.write(`${PROMPT}${prev}`);
          bufferRef.current = prev;
        } else {
          bufferRef.current = "";
        }
        return;
      }

      // Arrow down
      if (data === "\x1b[B") {
        const next = historyRef.current.navigateDown();
        if (next !== undefined) {
          term.write("\r".repeat(term.cols ?? 80) + "\x1b[K");
          term.write(`${PROMPT}${next}`);
          bufferRef.current = next;
        } else {
          term.write("\r".repeat(term.cols ?? 80) + "\x1b[K");
          term.write(`${PROMPT}`);
          bufferRef.current = "";
        }
        return;
      }

      // Tab - autocomplete
      if (char === 0x09) {
        const matches = autocomplete(bufferRef.current);
        if (matches.length === 1) {
          const completion = matches[0]!.slice(bufferRef.current.length);
          bufferRef.current = matches[0]!;
          term.write(completion);
        } else if (matches.length > 1) {
          term.write(`\r\n${matches.join("  ")}\r\n`);
          term.write(`${PROMPT}${bufferRef.current}`);
        }
        return;
      }

      // Printable characters
      if (data.length === 1 && char >= 0x20) {
        bufferRef.current += data;
        term.write(data);
        return;
      }
    };

    term.onData(handleData);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [wsUrl, isProcessing]);

  return <div className="terminal-container" ref={termRef} />;
}
