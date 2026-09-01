export type ModuleDifficulty = "Beginner" | "Intermediate" | "Advanced";

export interface Module {
  id: string;
  title: string;
  prompt: string;
  difficulty: ModuleDifficulty;
  durationSec: number;
  completed?: boolean;
}
