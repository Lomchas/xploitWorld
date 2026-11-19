/** Syntax for the virtual shell. Never passed to a host shell or subprocess. */
export const MAX_COMMAND_LENGTH = 2000;
export const COMMAND_WHITELIST = new Set([
  "ls",
  "cd",
  "pwd",
  "cat",
  "echo",
  "whoami",
  "id",
  "uname",
  "help",
  "clear",
  "head",
  "tail",
  "wc",
  "tree",
  "grep",
  "find",
  "env",
  "ps",
  "kill",
  "ip",
  "curl",
  "chmod",
  "stat",
  "sudo",
  "base64",
  "sha256sum",
  "mission",
  "mkdir",
  "touch",
  "write",
  "rm",
  "rmdir",
  "check",
  "hint",
  "set",
  "test",
  "branch",
  "submit",
  "epilogo",
  "epilogue",
  "certificado",
  "certificate",
  "open",
  "import",
  "export-log",
]);
export interface EchoRedirect {
  path: string;
  append: boolean;
}
export interface ParsedCommand {
  command: string;
  args: string[];
  flags: Record<string, string>;
  redirect?: EchoRedirect;
  error?: string;
}
// eslint-disable-next-line no-control-regex -- Explicitly reject shell control bytes from untrusted input.
const controls = /[\x00-\x08\x0a-\x1f\x7f-\x9f]/;
const operators = /[;&|<>$`]/;
type Token = { word: string; literal: boolean } | { redirect: ">" | ">>" };

export function tokenizeCommand(raw: string): ParsedCommand {
  const flags: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  const fail = (error: string): ParsedCommand => ({
    command: "",
    args: [],
    flags,
    error,
  });
  if (!raw.trim() || raw.length > MAX_COMMAND_LENGTH)
    return fail("Comando vacío o demasiado largo (máximo 2000 caracteres)");
  if (controls.test(raw)) return fail("Carácter de control no permitido");

  const tokens: Token[] = [];
  let token = "";
  let quote = "";
  let escaping = false;
  let started = false;
  let literal = false;
  const flush = (): void => {
    if (started) tokens.push({ word: token, literal });
    token = "";
    started = false;
    literal = false;
  };
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (escaping) {
      token += char;
      escaping = false;
      started = true;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      started = true;
      literal = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else token += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      literal = true;
      continue;
    }
    if (char === ">") {
      flush();
      const append = raw[i + 1] === ">";
      if (append) i++;
      tokens.push({ redirect: append ? ">>" : ">" });
    } else if (operators.test(char)) {
      return fail("Operador o sustitución no permitido");
    } else if (/\s/.test(char)) {
      flush();
    } else {
      token += char;
      started = true;
    }
  }
  if (quote || escaping) return fail("Comillas o escape sin cerrar");
  flush();
  const first = tokens.shift();
  if (!first || !("word" in first)) return fail("Comando inválido");
  const command = first.word;
  if (!COMMAND_WHITELIST.has(command))
    return {
      command,
      args: [],
      flags,
      error: `Comando "${command}" no disponible. Usa help.`,
    };
  const redirectAt = tokens.findIndex((item) => "redirect" in item);
  let redirect: EchoRedirect | undefined;
  if (redirectAt >= 0) {
    const symbol = tokens[redirectAt];
    const target = tokens[redirectAt + 1];
    if (
      command !== "echo" ||
      !symbol ||
      !("redirect" in symbol) ||
      !target ||
      !("word" in target) ||
      !target.word ||
      tokens.length !== redirectAt + 2
    )
      return fail('Uso: echo "texto" > ruta o echo "texto" >> ruta');
    redirect = { path: target.word, append: symbol.redirect === ">>" };
    tokens.length = redirectAt;
  }
  const args: string[] = [];
  let parseFlags = true;
  for (const item of tokens) {
    if (!("word" in item)) return fail("Operador no permitido");
    const part = item.word;
    if (command !== "echo" && operators.test(part))
      return fail("Operador o sustitución no permitido");
    if (parseFlags && !item.literal && part === "--") {
      parseFlags = false;
      continue;
    }
    if (command === "echo") {
      if (parseFlags && !item.literal && part === "-n") flags.n = "true";
      else {
        args.push(part);
        parseFlags = false;
      }
    } else if (
      parseFlags &&
      !item.literal &&
      /^--[a-zA-Z][\w-]*(?:=.*)?$/.test(part)
    ) {
      const equal = part.indexOf("=");
      const name = part.slice(2, equal === -1 ? undefined : equal);
      flags[name] = equal === -1 ? "true" : part.slice(equal + 1);
    } else if (parseFlags && !item.literal && /^-[a-zA-Z]+$/.test(part)) {
      for (const name of part.slice(1)) flags[name] = "true";
    } else args.push(part);
  }
  return { command, args, flags, ...(redirect ? { redirect } : {}) };
}

export function isCommandSafe(
  command: string,
  args: string[],
  flags: Record<string, string>,
): { safe: boolean; reason?: string } {
  if (!COMMAND_WHITELIST.has(command))
    return { safe: false, reason: "Comando no disponible" };
  if (
    [...args, ...Object.keys(flags), ...Object.values(flags)].some(
      (value) =>
        controls.test(value) || (command !== "echo" && operators.test(value)),
    )
  ) {
    return { safe: false, reason: "Argumento no permitido" };
  }
  // '..' is intentionally allowed: virtual paths are normalized inside the simulated root.
  return { safe: true };
}

export function formatLinuxOutput(
  command: string,
  args: string[],
  output: string | readonly string[] | number,
  exitCode: number,
): string {
  if (exitCode !== 0)
    return `${command}: ${args[0] ?? ""}: No such file or directory`;
  return Array.isArray(output) ? output.join("\n") : String(output);
}
