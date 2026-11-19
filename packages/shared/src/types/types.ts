export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT" | "NIGHTMARE";

/** Public DTO. The solution flag never leaves the server in catalog responses. */
export interface LevelSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  difficulty: Difficulty;
  isActive: boolean;
  orderIndex: number;
}
export type LevelDetail = LevelSummary;

export interface SessionUser {
  id: string;
  username: string;
}

export interface UserProgressEntry {
  userId: string;
  levelId: string;
  completed: boolean;
  attempts: number;
  /** JSON uses ISO strings, not Date instances. */
  completedAt: string | null;
  level: LevelSummary;
}

export interface FlagSubmission {
  accepted: boolean;
  progress: UserProgressEntry;
}
export interface ProgressReport {
  userId: string;
  levelProgress: UserProgressEntry[];
  overallCompletion: number;
}
