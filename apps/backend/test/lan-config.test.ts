import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFrontendOrigins } from "../src/lib/origins";

const fixtures: string[] = [];
function installation() {
  const root = mkdtempSync(resolve(tmpdir(), "proyecto (14) xwd-lan-"));
  fixtures.push(root);
  mkdirSync(resolve(root, "apps/backend"), { recursive: true });
  mkdirSync(resolve(root, "scripts"));
  const script = resolve(root, "scripts/lan-config.mjs");
  copyFileSync(resolve(__dirname, "../../../scripts/lan-config.mjs"), script);
  const story = resolve(root, "apps/backend/.env");
  const pvp = resolve(root, "apps/backend/.env.pvp");
  writeFileSync(
    story,
    "\uFEFFGAME_MODE=story\r\nDATABASE_URL=postgresql://test:local@127.0.0.1:5434/story\r\nFRONTEND_ORIGINS=http://historia.localhost:5174,http://:5174\r\n",
  );
  writeFileSync(
    pvp,
    "GAME_MODE=pvp\nDATABASE_URL=postgresql://test:local@127.0.0.1:5433/arena\nFRONTEND_ORIGINS=http://:5175\n",
  );
  return { root, script, story, pvp };
}
afterEach(() =>
  fixtures
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);

describe("LAN origin repair", () => {
  it("repairs the reported invalid origins in both files and is safe to repeat", () => {
    const fixture = installation();
    const standalone = resolve(fixture.root, "XploitworlD_Reparar_LAN.mjs");
    copyFileSync(fixture.script, standalone);
    const run = () =>
      execFileSync(process.execPath, [standalone, "192.168.40.103"], {
        cwd: fixture.root,
        encoding: "utf8",
      });
    const output = run();
    const initial = [fixture.story, fixture.pvp].map((path) =>
      readFileSync(path, "utf8"),
    );
    for (const [index, text] of initial.entries()) {
      const origins = /^FRONTEND_ORIGINS=([^\r\n]*)/m.exec(text)![1]!;
      expect(readFrontendOrigins(origins)).toContain(
        "http://192.168.40.103:" + (index === 0 ? 5174 : 5175),
      );
      expect(text).not.toContain("http://:");
      expect(text).toContain("DATABASE_URL=postgresql://test:local@127.0.0.1:");
      expect(text).toContain(index === 0 ? "GAME_MODE=story" : "GAME_MODE=pvp");
    }
    expect(output).toContain("http://192.168.40.103:5173/");
    expect(output).not.toContain("postgresql://");
    run();
    expect(
      [fixture.story, fixture.pvp].map((path) => readFileSync(path, "utf8")),
    ).toEqual(initial);
  });
  it("rejects a missing or invalid IP before changing either environment file", () => {
    const fixture = installation();
    const before = [fixture.story, fixture.pvp].map((path) =>
      readFileSync(path, "utf8"),
    );
    for (const args of [
      [],
      [""],
      ["http://192.168.40.103"],
      ["127.0.0.1"],
      ["0.0.0.0"],
      ["192.168.40.999"],
    ]) {
      const result = spawnSync(process.execPath, [fixture.script, ...args], {
        cwd: fixture.root,
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("IPv4 LAN válida");
      expect(
        [fixture.story, fixture.pvp].map((path) => readFileSync(path, "utf8")),
      ).toEqual(before);
    }
  });
  it("adds only valid interface addresses during development and preserves configured HTTPS origins", () => {
    const fixture = installation();
    const code =
      "import { developmentOrigins } from " +
      JSON.stringify(pathToFileURL(fixture.script).href) +
      ";" +
      "console.log(developmentOrigins('http://:5174,https://historia.example.com','story',['','192.168.40.103','not-an-ip']));";
    const result = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { encoding: "utf8" },
    ).trim();
    expect(readFrontendOrigins(result)).toContain("http://192.168.40.103:5174");
    expect(readFrontendOrigins(result)).toContain("http://127.0.0.1:5174");
    expect(readFrontendOrigins(result)).toContain(
      "https://historia.example.com",
    );
    expect(result).not.toContain("http://:");
    expect(result).not.toContain("not-an-ip");
  });
  it("keeps local startup available when the operating system denies interface enumeration", () => {
    const fixture = installation();
    const code =
      "import os from 'node:os'; import { syncBuiltinESMExports } from 'node:module';" +
      "os.networkInterfaces=()=>{throw new Error('Unavailable')};syncBuiltinESMExports();" +
      "const { developmentOrigins }=await import(" +
      JSON.stringify(pathToFileURL(fixture.script).href) +
      ");" +
      "console.log(developmentOrigins('http://:5174','story'));";
    const result = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { encoding: "utf8" },
    ).trim();
    expect(readFrontendOrigins(result)).toContain("http://127.0.0.1:5174");
    expect(result).not.toContain("http://:");
  });
});
