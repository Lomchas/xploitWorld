export type Placeholder = string;

/** Difficulty levels for the wargame */
export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT" | "NIGHTMARE";

/** Level summary interface */
export interface LevelSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  difficulty: Difficulty;
  flag: string;
  isActive: boolean;
  orderIndex: number;
}

/** Level detail interface */
export interface LevelDetail extends LevelSummary {
  // Full level details
}

/** User progress entry interface */
export interface UserProgressEntry {
  userId: string;
  levelId: string;
  completed: boolean;
  attempts: number;
  completedAt: Date | null;
  level: LevelDetail;
}

/** Progress report interface */
export interface ProgressReport {
  userId: string;
  levelProgress: UserProgressEntry[];
  overallCompletion: number;
}
