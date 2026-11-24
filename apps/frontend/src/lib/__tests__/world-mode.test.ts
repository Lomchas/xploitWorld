import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
async function navigation(address: string) {
  vi.resetModules();
  const url = new URL(address);
  vi.stubGlobal("window", {
    location: { href: url.href, hostname: url.hostname, port: url.port },
  });
  return import("../world-mode");
}

describe("Navigation between game modes", () => {
  it("keeps all three entry points on the LAN host in development", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_STORY_ORIGIN", "http://historia.localhost:5174");
    const game = await navigation("http://192.168.40.103:5173/");
    expect(new URL(game.worldUrl("menu")).origin).toBe(
      "http://192.168.40.103:5173",
    );
    expect(new URL(game.worldUrl("story", "/historia")).href).toBe(
      "http://192.168.40.103:5174/historia",
    );
    expect(new URL(game.worldUrl("pvp", "/pvp")).href).toBe(
      "http://192.168.40.103:5175/pvp",
    );
  });
  it("preserves the existing local host names on the developer computer", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_STORY_ORIGIN", "");
    vi.stubEnv("VITE_PVP_ORIGIN", "");
    const game = await navigation("http://127.0.0.1:5173/");
    expect(new URL(game.worldUrl("story")).origin).toBe(
      "http://historia.localhost:5174",
    );
    expect(new URL(game.worldUrl("pvp")).origin).toBe(
      "http://pvp.localhost:5175",
    );
  });
  it("uses the configured public origins in production", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_STORY_ORIGIN", "https://historia.example.com");
    vi.stubEnv("VITE_PVP_ORIGIN", "https://pvp.example.com");
    const game = await navigation("https://menu.example.com/");
    expect(new URL(game.worldUrl("story")).origin).toBe(
      "https://historia.example.com",
    );
    expect(new URL(game.worldUrl("pvp")).origin).toBe(
      "https://pvp.example.com",
    );
  });
});
