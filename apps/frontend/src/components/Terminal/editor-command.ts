import {
  resolveVirtualPath,
  tokenizeCommand,
  WORKSPACE_ROOT,
} from "@null-protocol/shared";

export function editorCommand(raw: string): { name: string } | null {
  const parsed = tokenizeCommand(raw);
  if (
    parsed.command !== "echo" ||
    parsed.error ||
    parsed.redirect ||
    Object.keys(parsed.flags).length ||
    parsed.args.length > 1
  )
    return null;
  const name = parsed.args[0] ?? "";
  const quoted = /^echo\s+["']/.test(raw);
  // Quoted text still prints. A quoted path can contain spaces.
  if (quoted && !/[/.]/.test(name)) return null;
  return { name };
}

export function editorPath(
  name: string,
  cwd: string,
  root = WORKSPACE_ROOT,
  home?: string,
): string {
  const base = cwd === root || cwd.startsWith(root + "/") ? cwd : root;
  return resolveVirtualPath(name, base, home);
}
