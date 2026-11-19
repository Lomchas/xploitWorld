import { describe, expect, it } from "vitest";
import { tokenizeCommand, isCommandSafe } from "../src/terminal/parser";
import { isWsMessage, isCmdPayload } from "../src/types/ws";

describe("virtual command parsing", () => {
  it("keeps quoted words and escaped spaces together", () => {
    expect(tokenizeCommand('echo "hola mundo" uno\\ dos').args).toEqual([
      "hola mundo",
      "uno dos",
    ]);
    expect(tokenizeCommand("echo '' \"\"").args).toEqual(["", ""]);
  });
  it("recognizes only an unquoted final echo redirection", () => {
    expect(
      tokenizeCommand('echo -n "a > b" >> "~/trabajo/mi nota.txt"'),
    ).toMatchObject({
      command: "echo",
      args: ["a > b"],
      flags: { n: "true" },
      redirect: { path: "~/trabajo/mi nota.txt", append: true },
    });
    expect(tokenizeCommand('echo ">>"').redirect).toBeUndefined();
    expect(tokenizeCommand('echo "-n" >~/trabajo/nota.txt').args).toEqual([
      "-n",
    ]);
  });
  it.each([
    "cat README.txt > copia.txt",
    "echo a >",
    "echo a >>> b",
    "echo a > b > c",
    "echo a > b c",
  ])("rejects malformed redirection %s", (input) =>
    expect(tokenizeCommand(input).error).toBeDefined(),
  );
  it("splits combined short flags and long values", () => {
    const result = tokenizeCommand("ls -la --color=never");
    expect(result.flags).toEqual({ l: "true", a: "true", color: "never" });
  });
  it("supports the end of flags separator", () => {
    expect(tokenizeCommand("cat -- -file").args).toEqual(["-file"]);
  });
  it("does not pollute object prototypes with flag names", () => {
    const result = tokenizeCommand("ls --constructor=polluted");
    expect(result.flags.constructor).toBe("polluted");
    expect(Object.getPrototypeOf(result.flags)).toBeNull();
  });
  it.each(["", "   ", "x".repeat(2001), 'echo "sin cerrar', "echo final\\"])(
    "rejects invalid input %s",
    (input) => {
      expect(tokenizeCommand(input).error).toBeDefined();
    },
  );
  it.each([
    "echo x;pwd",
    "echo a\0b",
    "echo $(pwd)",
    "echo `pwd`",
    "ls && pwd",
    "ls | cat",
    "echo a\nb",
  ])("rejects controls and operators %s", (input) => {
    expect(tokenizeCommand(input).error).toBeDefined();
  });
  it("allows virtual parent navigation and ordinary -n flags", () => {
    expect(tokenizeCommand("cd ..").error).toBeUndefined();
    expect(isCommandSafe("head", ["file.txt"], { n: "true" }).safe).toBe(true);
  });
  it("rejects host commands", () => {
    expect(tokenizeCommand("bash").error).toContain("no disponible");
  });
});
describe("WebSocket input guards", () => {
  it.each([
    null,
    [],
    1,
    { type: "cmd" },
    { type: "unsupported", payload: {} },
    { type: "cmd", payload: {}, id: 4 },
  ])("rejects invalid envelopes", (input) => {
    expect(isWsMessage(input)).toBe(false);
  });
  it("validates command bodies without unsafe property access", () => {
    expect(isCmdPayload(null)).toBe(false);
    expect(isCmdPayload({ raw: 1 })).toBe(false);
    expect(isCmdPayload({ raw: "x".repeat(2001) })).toBe(false);
    expect(isCmdPayload({ raw: "pwd" })).toBe(true);
  });
});
