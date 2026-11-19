import { useMemo } from "react";
const LIMIT = 200;
const KEY = "nullprotocol.history";
interface HistoryOptions {
  initial?: string[];
  persist?: (commands: string[]) => void;
}
export function createHistory({ initial = [], persist }: HistoryOptions = {}) {
  const commands = initial
    .filter((value) => typeof value === "string" && value.length <= 2000)
    .slice(-LIMIT);
  let pointer = commands.length;
  return {
    commands,
    get pointer(): number {
      return pointer;
    },
    add(command: string): void {
      if (!command.trim() || command.length > 2000) return;
      if (commands.at(-1) !== command) {
        commands.push(command);
        if (commands.length > LIMIT) commands.shift();
      }
      pointer = commands.length;
      persist?.(commands);
    },
    navigateUp(): string | undefined {
      if (commands.length === 0) return undefined;
      pointer = Math.max(0, pointer - 1);
      return commands[pointer];
    },
    navigateDown(): string | undefined {
      pointer = Math.min(commands.length, pointer + 1);
      return commands[pointer];
    },
    resetPointer(): void {
      pointer = commands.length;
    },
  };
}
export function useHistory(mode: "story" | "pvp" = "story") {
  const key = mode === "story" ? KEY : KEY + ".pvp";
  return useMemo(() => {
    let initial: string[] = [];
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      if (Array.isArray(parsed))
        initial = parsed.filter(
          (value: unknown): value is string => typeof value === "string",
        );
    } catch {
      /* Storage may be blocked or contain invalid JSON. */
    }
    return createHistory({
      initial,
      persist: (commands) => {
        try {
          sessionStorage.setItem(key, JSON.stringify(commands));
        } catch {
          /* Keep memory history. */
        }
      },
    });
  }, [key]);
}
