import { describe, expect, it } from "vitest";
import { handleMessage } from "../src/ws/handler";
import { VirtualShell } from "../src/game/shell";
import { hashToken, readSessionToken } from "../src/lib/session";
import { verifyFlag } from "../src/app";

describe("WebSocket handler", () => {
  it.each([
    "{",
    "null",
    "[]",
    "1",
    '{"type":"cmd","payload":null}',
    '{"type":"cmd","payload":{"raw":5}}',
  ])("answers malformed input without crashing", (raw) => {
    const messages: string[] = [];
    expect(() =>
      handleMessage(
        { readyState: 1, send: (message) => messages.push(String(message)) },
        raw,
        new VirtualShell(),
      ),
    ).not.toThrow();
    expect(JSON.parse(messages[0]!)).toMatchObject({ type: "error" });
  });
  it("correlates responses by id", () => {
    const messages: string[] = [];
    handleMessage(
      { readyState: 1, send: (message) => messages.push(String(message)) },
      JSON.stringify({ type: "cmd", payload: { raw: "pwd" }, id: "one" }),
      new VirtualShell(),
    );
    expect(JSON.parse(messages[0]!)).toMatchObject({
      type: "cmd_response",
      id: "one",
      payload: { cwd: "/home/guest", exitCode: 0 },
    });
  });
  it("does not send on a closed socket", () => {
    const messages: string[] = [];
    handleMessage(
      { readyState: 3, send: (message) => messages.push(String(message)) },
      '{"type":"ping","payload":null}',
      new VirtualShell(),
    );
    expect(messages).toHaveLength(0);
  });
});
describe("credentials and flags", () => {
  it("parses only exact opaque cookie values", () => {
    const token = "a".repeat(64);
    expect(readSessionToken(`other=x; null_session=${token}`)).toBe(token);
    expect(readSessionToken("null_session=broken")).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
    expect(hashToken(token)).not.toBe(token);
  });
  it("compares flags exactly even with different lengths", () => {
    expect(verifyFlag("NULL{test}", "NULL{test}")).toBe(true);
    expect(verifyFlag("null{test}", "NULL{test}")).toBe(false);
    expect(verifyFlag("", "NULL{test}")).toBe(false);
  });
});
