import { translate } from "@null-protocol/shared";
import { readLocale } from "./locale";
import type {
  AcademyAnswers,
  AcademyCase,
  AcademyLessonId,
  AcademyResult,
  AcademyState,
  AcademyToolId,
  ExchangeAction,
  ExchangeResult,
  ExchangeState,
  WorldState,
  AccountCredentials,
  AccountState,
  FlagSubmission,
  LevelDetail,
  LevelSummary,
  PvpAction,
  PvpActionResult,
  PvpJoinResult,
  PvpRegionId,
  PvpState,
  ProgressReport,
  SessionUser,
  UserProgressEntry,
  WorkspaceAction,
  WorkspaceEntry,
  WorkspaceListing,
  WorkspaceText,
} from "@null-protocol/shared";
export type {
  Difficulty,
  LevelSummary,
  LevelDetail,
  UserProgressEntry,
  ProgressReport,
} from "@null-protocol/shared";

const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_BASE = base.endsWith("/api") ? base : `${base}/api`;
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  options: RequestInit = {},
  decode?: (response: Response) => Promise<T>,
): Promise<T> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 10_000);
  try {
    const headers = new Headers(options.headers);
    headers.set("Accept-Language", readLocale());
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...options,
      headers,
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout.signal])
        : timeout.signal,
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `Error de API (${response.status})`;
      throw new ApiError(response.status, translate(readLocale(), message));
    }
    return (
      response.status === 204
        ? undefined
        : decode
          ? await decode(response)
          : await response.json()
    ) as T;
  } finally {
    window.clearTimeout(timer);
  }
}
let sessionRequest: Promise<SessionUser> | null = null;
/** Single flight prevents duplicate guest accounts when React mounts several consumers. */
export function ensureGuestSession(): Promise<SessionUser> {
  if (!sessionRequest) {
    sessionRequest = request<{ user: SessionUser }>("/session")
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        return request<{ user: SessionUser }>("/session", { method: "POST" });
      })
      .then((value) => value.user)
      .finally(() => {
        sessionRequest = null;
      });
  }
  return sessionRequest;
}
export const fetchLevels = (): Promise<LevelSummary[]> => request("/levels");
export const fetchLevelBySlug = (slug: string): Promise<LevelDetail> =>
  request(`/levels/${encodeURIComponent(slug)}`);
export const fetchUserProgress = (): Promise<UserProgressEntry[]> =>
  request("/progress");
export const submitFlag = (
  levelId: string,
  flag: string,
): Promise<FlagSubmission> =>
  request("/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ levelId, flag }),
  });
export async function fetchProgressReport(): Promise<ProgressReport> {
  const user = await ensureGuestSession();
  const [progress, levels] = await Promise.all([
    fetchUserProgress(),
    fetchLevels(),
  ]);
  return buildProgressReport(user.id, progress, levels);
}
export function buildProgressReport(
  userId: string,
  progress: UserProgressEntry[],
  levels: LevelSummary[],
): ProgressReport {
  const active = new Map(levels.map((level) => [level.id, level]));
  const unique = new Map(
    progress
      .filter((entry) => active.has(entry.levelId))
      .map((entry) => [entry.levelId, entry]),
  );
  const levelProgress = [...unique.values()].map((entry) => ({
    ...entry,
    level: active.get(entry.levelId)!,
  }));
  const completed = levelProgress.filter((entry) => entry.completed).length;
  return {
    userId,
    levelProgress,
    overallCompletion: levels.length
      ? Math.round((completed / levels.length) * 100)
      : 0,
  };
}

export function fetchPvpState(page: number, query: string): Promise<PvpState> {
  const params = new URLSearchParams({ page: String(page), q: query });
  return request("/pvp/state?" + params.toString());
}
export function joinPvp(
  regionId: PvpRegionId,
  alias: string,
  hostname?: string,
): Promise<PvpJoinResult> {
  return request("/pvp/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regionId, alias, hostname }),
  });
}
export function sendPvpAction(
  requestId: string,
  action: PvpAction,
  arenaVisit?: number,
): Promise<PvpActionResult> {
  return request("/pvp/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, action, arenaVisit }),
  });
}

export function transferPvp(
  regionId: PvpRegionId,
  arenaVisit: number,
  alias?: string,
): Promise<PvpJoinResult> {
  return request("/pvp/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regionId, arenaVisit, alias }),
  });
}

const workspaceUrl = (endpoint: string, path: string) =>
  `/workspace/${endpoint}?path=${encodeURIComponent(path)}`;

export const fetchAcademy = (): Promise<AcademyState> => request("/academy");
export const activateAcademyTool = (id: AcademyToolId): Promise<AcademyState> =>
  request(`/academy/licenses/${id}`, { method: "POST" });
export const prepareAcademyLesson = (
  id: AcademyLessonId,
): Promise<AcademyState> =>
  request(`/academy/lessons/${id}/prepare`, { method: "POST" });
export const fetchAcademyLesson = (id: AcademyLessonId): Promise<AcademyCase> =>
  request(`/academy/lessons/${id}`);
export const submitAcademyAnswers = (
  id: AcademyLessonId,
  answers: AcademyAnswers,
): Promise<AcademyResult> =>
  request(`/academy/lessons/${id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
export const listWorkspace = (path: string): Promise<WorkspaceListing> =>
  request(workspaceUrl("entries", path));
export const readWorkspaceText = (path: string): Promise<WorkspaceText> =>
  request(workspaceUrl("text", path));
export const readWorkspaceImage = (path: string): Promise<Blob> =>
  request(workspaceUrl("image", path), {}, (response) => response.blob());
export const updateWorkspace = (
  action: WorkspaceAction,
): Promise<WorkspaceEntry | null> =>
  request("/workspace/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
export const importWorkspaceImage = (
  path: string,
  file: File,
): Promise<WorkspaceEntry> =>
  request(workspaceUrl("image", path), {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

export const fetchAccount = (): Promise<AccountState> => request("/account");
const accountPost = (credentials: AccountCredentials): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(credentials),
});
export const linkAccount = (
  credentials: AccountCredentials,
): Promise<AccountState> => request("/account/link", accountPost(credentials));
export const loginAccount = (
  credentials: AccountCredentials,
): Promise<{ user: SessionUser }> =>
  request("/account/login", accountPost(credentials));
export const restoreMigratedAccount = (
  credentials: AccountCredentials & { claim: string },
): Promise<{ user: SessionUser }> =>
  request("/account/migration", accountPost(credentials));
export const logoutAccount = (): Promise<void> =>
  request("/session", { method: "DELETE" });

export const fetchExchange = (): Promise<ExchangeState> => request("/exchange");
export const fetchContracts = (): Promise<ExchangeState> =>
  request("/contracts");
export const fetchWorld = (
  arena?: PvpRegionId,
  signal?: AbortSignal,
): Promise<WorldState> =>
  request(arena ? "/world?arena=" + encodeURIComponent(arena) : "/world", {
    signal,
  });
export const exchangeAction = (
  requestId: string,
  action: ExchangeAction,
  desk: "exchange" | "contracts" = "exchange",
): Promise<ExchangeResult> =>
  request("/" + desk + "/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, action }),
  });
