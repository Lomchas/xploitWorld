import { type LevelSummary, type UserProgressEntry, type ProgressReport } from "@null-protocol/shared";

const API_BASE = "/api";

export interface LevelDetail extends LevelSummary {
  // Full level details
}

/** Fetch all levels ordered by difficulty */
export async function fetchLevels(): Promise<LevelSummary[]> {
  const response = await fetch(`${API_BASE}/levels`);
  if (!response.ok) {
    throw new Error("Failed to fetch levels");
  }
  return response.json();
}

/** Fetch a specific level by slug */
export async function fetchLevelBySlug(slug: string): Promise<LevelDetail> {
  const response = await fetch(`${API_BASE}/levels/${slug}`);
  if (response.status === 404) {
    throw new Error("Level not found");
  }
  if (!response.ok) {
    throw new Error("Failed to fetch level");
  }
  return response.json();
}

/** Update user progress for a level */
export async function updateProgress(
  userId: string,
  levelId: string,
  completed: boolean
): Promise<UserProgressEntry> {
  const response = await fetch(`${API_BASE}/progress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, levelId, completed }),
  });
  if (!response.ok) {
    throw new Error("Failed to update progress");
  }
  return response.json();
}

/** Fetch user's progress across all levels */
export async function fetchUserProgress(userId: string): Promise<UserProgressEntry[]> {
  const response = await fetch(`${API_BASE}/progress/${userId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch user progress");
  }
  return response.json();
}

/** Fetch complete progress report for a user */
export async function fetchProgressReport(userId: string): Promise<ProgressReport> {
  const [progress, levels] = await Promise.all([
    fetchUserProgress(userId),
    fetchLevels(),
  ]);

  const levelMap = new Map(levels.map((l) => [l.slug, l]));

  const levelProgress = progress.map((p) => ({
    userId: p.userId,
    levelId: p.levelId,
    completed: p.completed,
    attempts: p.attempts,
    completedAt: p.completedAt,
    level: levelMap.get(p.levelId) || {
      id: p.levelId,
      name: "Unknown",
      slug: p.levelId,
      description: "",
      difficulty: "EASY",
      flag: "",
      isActive: false,
      orderIndex: 0,
    },
  }));

  const totalLevels = levels.length;
  const completedLevels = levelProgress.filter((p) => p.completed).length;
  const overallCompletion = totalLevels > 0 ? Math.round((completedLevels / totalLevels) * 100) : 0;

  return {
    userId,
    levelProgress,
    overallCompletion,
  };
}