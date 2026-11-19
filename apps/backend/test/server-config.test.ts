import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const fixtures: string[] = [];
function installation() {
  const root = mkdtempSync(resolve(tmpdir(), "xwd-server-"));
  fixtures.push(root);
  mkdirSync(resolve(root, "scripts"));
  const script = resolve(root, "scripts/server.mjs");
  copyFileSync(resolve(__dirname, "../../../scripts/server.mjs"), script);
  const configure = (target: string) =>
    execFileSync(process.execPath, [script, "config", target], {
      encoding: "utf8",
    });
  const values = () =>
    Object.fromEntries(
      readFileSync(resolve(root, ".env.server"), "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("=")),
    );
  return { root, script, configure, values };
}
afterEach(() =>
  fixtures
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);

describe("Complete game server configuration", () => {
  it("creates three HTTPS hosts and independent database passwords from a public IPv4", () => {
    const fixture = installation();
    const output = fixture.configure("203.0.113.10");
    const values = fixture.values();
    expect(values.XWD_MENU_HOST).toBe("xploitworld.203-0-113-10.sslip.io");
    expect(values.XWD_STORY_HOST).toBe("historia." + values.XWD_MENU_HOST);
    expect(values.XWD_PVP_HOST).toBe("pvp." + values.XWD_MENU_HOST);
    expect(values.XWD_STORY_DB_PASSWORD).toMatch(/^[a-f0-9]{64}$/u);
    expect(values.XWD_PVP_DB_PASSWORD).toMatch(/^[a-f0-9]{64}$/u);
    expect(values.XWD_STORY_DB_PASSWORD).not.toBe(values.XWD_PVP_DB_PASSWORD);
    expect(output).not.toContain(values.XWD_STORY_DB_PASSWORD);
    expect(output).not.toContain(values.XWD_PVP_DB_PASSWORD);
  });
  it("preserves both passwords on repeated setup and when the domain changes", () => {
    const fixture = installation();
    fixture.configure("203.0.113.10");
    const initial = fixture.values();
    fixture.configure("203.0.113.10");
    expect(fixture.values()).toEqual(initial);
    fixture.configure("XPLOITWORLD.EXAMPLE.COM");
    const changed = fixture.values();
    expect(changed.XWD_MENU_HOST).toBe("xploitworld.example.com");
    expect(changed.XWD_STORY_DB_PASSWORD).toBe(initial.XWD_STORY_DB_PASSWORD);
    expect(changed.XWD_PVP_DB_PASSWORD).toBe(initial.XWD_PVP_DB_PASSWORD);
  });
  it("rejects invalid host syntax while preserving the last configuration", () => {
    const fixture = installation();
    fixture.configure("203.0.113.10");
    const initial = fixture.values();
    for (const target of [
      "https://example.com/path",
      "example.com\nPORT=9",
      "-bad.example.com",
      "::1",
    ]) {
      const result = spawnSync(process.execPath, [
        fixture.script,
        "config",
        target,
      ]);
      expect(result.status).toBe(1);
      expect(fixture.values()).toEqual(initial);
    }
  });
  it("reports the missing configuration before trying to start Docker", () => {
    const fixture = installation();
    const result = spawnSync(process.execPath, [fixture.script, "start"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("servidor:config");
  });
});
