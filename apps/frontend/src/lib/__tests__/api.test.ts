import { afterEach, expect, it, vi } from "vitest";
import { buildProgressReport, ensureGuestSession, fetchLevels } from "../api";
import type { LevelSummary, UserProgressEntry } from "@null-protocol/shared";
afterEach(() => vi.unstubAllGlobals());
const level: LevelSummary = {
  id: "id-1",
  slug: "level-one",
  name: "One",
  description: "One",
  difficulty: "EASY",
  isActive: true,
  orderIndex: 1,
};
it("matches progress by database id and excludes inactive levels", () => {
  const entry: UserProgressEntry = {
    userId: "guest",
    levelId: level.id,
    completed: true,
    attempts: 1,
    completedAt: "2026-11-06T00:00:00Z",
    level,
  };
  const report = buildProgressReport(
    "guest",
    [entry, { ...entry, levelId: "removed" }],
    [level],
  );
  expect(report.overallCompletion).toBe(100);
  expect(report.levelProgress).toEqual([entry]);
});
it("reports zero completion for an empty catalog", () => {
  expect(buildProgressReport("guest", [], []).overallCompletion).toBe(0);
});
it("does not create guest accounts on server failures", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response('{"error":"DB unavailable"}', { status: 503 }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(ensureGuestSession()).rejects.toThrow("DB unavailable");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("shares a guest initialization request and sends cookies", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValueOnce(
      new Response('{"user":{"id":"guest","username":"guest"}}', {
        status: 201,
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const [one, two] = await Promise.all([
    ensureGuestSession(),
    ensureGuestSession(),
  ]);
  expect(one).toEqual(two);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]![1]).toMatchObject({
    method: "POST",
    credentials: "include",
  });
});
it("preserves API error messages", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":"No disponible"}', { status: 500 }),
      ),
  );
  await expect(fetchLevels()).rejects.toThrow("No disponible");
});
