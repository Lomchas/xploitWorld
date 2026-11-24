import { describe, expect, it } from "vitest";
import { freshDevice, type VirtualHost } from "../src/pvp/network";
import { evaluatePortal } from "../src/pvp/drill";

describe("defensive duty challenge", () => {
  it("does not confuse a temporary administration restart or global isolation with a working secure portal", () => {
    const at = new Date("2026-11-24T12:00Z");
    const host: VirtualHost = {
      id: "u",
      address: "2001:db8::2",
      integrity: 100,
      config: freshDevice(),
    };
    host.config.tls = true;
    host.config.services.web.patched = true;
    host.config.services.admin.restartUntil = "2026-11-24T12:01Z";
    expect(
      evaluatePortal(host, at)
        .filter((item) => !item.passed)
        .map((item) => item.id),
    ).toEqual(["admin"]);
    host.config.services.admin.open = false;
    expect(evaluatePortal(host, at).every((item) => item.passed)).toBe(true);
    host.config.isolated = true;
    expect(
      evaluatePortal(host, at)
        .filter((item) => item.passed)
        .map((item) => item.id),
    ).toEqual(["admin"]);
  });
});
