import { describe, expect, it } from "vitest";
import { cursorStep, visibleInput } from "./editable-line";

describe("terminal line editing", () => {
  it("moves one visible character through a combining mark and an emoji", () => {
    const line = "ae\u0301🌐z";
    expect(cursorStep(line, 1, 1)).toBe(3);
    expect(cursorStep(line, 3, 1)).toBe(5);
    expect(cursorStep(line, 5, -1)).toBe(3);
    expect(cursorStep(line, 0, -1)).toBe(0);
  });
  it("keeps a long command on one row without changing the command", () => {
    const value = "x".repeat(2000);
    const edited = visibleInput("guest$ ", value, 1000, 30);
    expect(edited.line.length).toBeLessThan(30);
    expect(edited.before).toMatch(/^guest\$ </);
    expect(edited.line).toMatch(/>$/);
  });
});
