import {
  tokenizeCommand,
  WORKSPACE_ROOT,
  type CmdResponsePayload,
  type WorkspaceAction,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import type { VirtualShell } from "../game/shell";
import type { WorkspaceService } from "./service";

const fileCommands = new Set([
  "pwd",
  "cd",
  "ls",
  "stat",
  "cat",
  "open",
  "head",
  "tail",
  "wc",
  "grep",
  "find",
  "tree",
  "sha256sum",
  "base64",
]);

export async function executeWorkspaceCommand(
  workspace: WorkspaceService,
  userId: string,
  shell: VirtualShell,
  raw: string,
): Promise<CmdResponsePayload> {
  const { command, args, flags, redirect, error } = tokenizeCommand(raw);
  if (error) return shell.execute(raw);
  const [first, second] = args;
  const reply = (output: string, exitCode = 0) => ({
    output,
    exitCode,
    cwd: shell.directory,
  });
  let action: WorkspaceAction | undefined;
  switch (command) {
    case "echo":
      if (redirect)
        action = {
          type: "write",
          path: shell.resolve(redirect.path),
          text: args.join(" ") + (flags.n ? "" : "\n"),
          append: redirect.append,
        };
      break;
    case "mkdir":
    case "touch":
    case "rm":
    case "rmdir":
      if (!first || args.length !== 1)
        return reply(`Uso: ${command} <ruta en ~/trabajo>`, 2);
      action =
        command === "rm" || command === "rmdir"
          ? {
              type: "remove",
              path: shell.resolve(first),
              kind: command === "rm" ? "file" : "directory",
            }
          : { type: command, path: shell.resolve(first) };
      break;
    case "write":
      if (!first || second === undefined)
        return reply('Uso: write <ruta en ~/trabajo> "texto"', 2);
      action = {
        type: "write",
        path: shell.resolve(first),
        text: args.slice(1).join(" "),
      };
      break;
    case "chmod": {
      if (!second) break;
      const path = shell.resolve(second);
      if (path !== WORKSPACE_ROOT && !path.startsWith(WORKSPACE_ROOT + "/"))
        break;
      if (!first || args.length !== 2 || !/^(0?[0-7]{3})$/.test(first))
        return reply("Uso: chmod <modo octal> <ruta>", 2);
      action = { type: "chmod", path, mode: Number.parseInt(first, 8) };
      break;
    }
  }
  try {
    if (action) {
      await workspace.mutate(userId, action);
      if (action.type === "remove")
        shell.mountWorkspace(await workspace.shellEntries(userId));
      return reply("");
    }
    if (fileCommands.has(command))
      shell.mountWorkspace(await workspace.shellEntries(userId));
    return shell.execute(raw);
  } catch (error: unknown) {
    if (error instanceof HttpError) return reply(error.message, 1);
    throw error;
  }
}
