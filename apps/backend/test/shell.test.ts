import { describe, expect, it } from "vitest";
import { VirtualShell } from "../src/game/shell";

describe("isolated virtual shell", () => {
  it("hides the tutorial signal until hidden files are requested", () => {
    const shell = new VirtualShell("TEST{flag}");
    expect(shell.execute("ls").output).not.toContain(".signal");
    expect(shell.execute("ls -la").output).toContain(".signal");
    expect(shell.execute("cat .signal").output).toBe("TEST{flag}");
  });
  it("keeps cwd per player and normalizes paths without escaping root", () => {
    const first = new VirtualShell();
    const second = new VirtualShell();
    first.execute("cd ../../../../..");
    expect(first.execute("pwd").cwd).toBe("/");
    expect(second.execute("pwd").cwd).toBe("/home/guest");
    expect(first.execute("cat /etc/passwd").exitCode).toBe(1);
  });
  it("returns command errors without losing state", () => {
    const shell = new VirtualShell();
    expect(shell.execute("cd README.txt").exitCode).toBe(1);
    expect(shell.execute("pwd").output).toBe("/home/guest");
    expect(shell.execute("cat").exitCode).toBe(2);
  });
  it("supports quoted echo and grep without regular expression execution", () => {
    const shell = new VirtualShell();
    expect(shell.execute('echo "hola mundo"').output).toBe("hola mundo");
    expect(shell.execute('grep "relé Norte" README.txt').output).toContain(
      "Relevo de Vanta",
    );
    expect(shell.execute('grep "[" README.txt').exitCode).toBe(1);
  });
  it("never interprets substitutions or host commands", () => {
    const shell = new VirtualShell();
    expect(shell.execute("cat /etc/hostname").output).toBe("xploitworld");
    expect(shell.execute("echo $(whoami)").exitCode).toBe(2);
    expect(shell.execute("node -e 1").exitCode).toBe(2);
  });
});

it("localizes mission evidence while preserving valid and disputed signatures", () => {
  const shell = new VirtualShell();
  shell.setLocale("en");
  shell.openMission("level-1-basic-commands", "TEST{flag}");
  expect(shell.execute("cat README.txt").output).toContain(
    "Vanta handover",
  );
  expect(shell.execute("cat .signal").output).toBe("TEST{flag}");
  expect(shell.execute("help").output).toContain("COMMAND");
  shell.openMission("chapter-1-ciudad-borrada", null);
  expect(shell.execute("sha256sum -c caso/boletin.sha256").exitCode).toBe(1);
  expect(shell.execute("sha256sum -c caso/origen.sha256").exitCode).toBe(0);
  expect(shell.execute("cat caso/recibo.txt").output).toContain("ZERO MARKET");
});
