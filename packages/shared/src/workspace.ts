export const VIRTUAL_HOME = "/home/guest";
export const WORKSPACE_ROOT = VIRTUAL_HOME + "/trabajo";
export const ARENA_HOME = "/home/operator";
export const ARENA_WORKSPACE_ROOT = ARENA_HOME + "/archivos";

export function resolveVirtualPath(
  input: string,
  cwd = VIRTUAL_HOME,
  home = VIRTUAL_HOME,
): string {
  const target =
    input === "~"
      ? home
      : input.startsWith("~/")
        ? home + input.slice(1)
        : input.startsWith("/")
          ? input
          : cwd + "/" + input;
  const parts: string[] = [];
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return ("/" + parts.join("/")).normalize("NFC");
}
export function isWorkspaceName(name: string): boolean {
  return (
    name.length <= 80 &&
    name === name.trim() &&
    name !== "." &&
    name !== ".." &&
    /^[\p{L}\p{M}\p{N} ._()-]+$/u.test(name)
  );
}

export const WORKSPACE_LIMITS = {
  entries: 160,
  fileTextBytes: 16 * 1024,
  totalTextBytes: 128 * 1024,
  fileImageBytes: 2 * 1024 * 1024,
  totalBytes: 12 * 1024 * 1024,
} as const;
export const WORKSPACE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type WorkspaceImageType = (typeof WORKSPACE_IMAGE_TYPES)[number];
export type WorkspaceKind = "DIRECTORY" | "TEXT" | "IMAGE";

export interface WorkspaceEntry {
  path: string;
  kind: WorkspaceKind;
  mode: number;
  mime: string | null;
  bytes: number;
  version: string;
  updatedAt: string;
}
export interface WorkspaceListing {
  path: string;
  entries: WorkspaceEntry[];
  usedBytes: number;
  usedEntries: number;
}
export interface WorkspaceText extends WorkspaceEntry {
  text: string;
}

export type WorkspaceAction =
  | { type: "mkdir" | "touch"; path: string }
  | {
      type: "write";
      path: string;
      text: string;
      append?: boolean;
      version?: string | null;
    }
  | {
      type: "remove";
      path: string;
      version?: string;
      kind?: "file" | "directory";
    }
  | { type: "chmod"; path: string; mode: number; version?: string };
