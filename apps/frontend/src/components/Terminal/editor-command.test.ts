import { describe, expect, it } from "vitest";
import { WORKSPACE_ROOT } from "@null-protocol/shared";
import { plainCommandPaste } from "./clipboard";
import { editorCommand, editorPath } from "./editor-command";

describe("console editor", () => {
  it("opens named and unnamed files while preserving echo output and redirection", () => {
    expect(editorCommand("echo")).toEqual({ name: "" });
    expect(editorCommand('echo "mi informe.txt"')).toEqual({
      name: "mi informe.txt",
    });
    expect(editorCommand('echo "hola mundo"')).toBeNull();
    expect(editorCommand("echo -n hola")).toBeNull();
    expect(editorCommand('echo "hola" >> informe.txt')).toBeNull();
    expect(editorPath("informe.txt", "/home/guest")).toBe(
      WORKSPACE_ROOT + "/informe.txt",
    );
    expect(editorPath("informe.txt", WORKSPACE_ROOT + "/caso")).toBe(
      WORKSPACE_ROOT + "/caso/informe.txt",
    );
  });

  it("keeps pasted clipboard content on one input line", () => {
    expect(plainCommandPaste("cat a.txt\r\nwhoami\t\x1b")).toBe(
      "cat a.txt whoami ",
    );
  });
});
