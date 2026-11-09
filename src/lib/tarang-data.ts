import type { Module } from "@/types";

/** Default practice curriculum, seeded on first run and used if the database is unreachable. */
export const modules: Module[] = [
  {
    id: "hobby",
    title: "Talk about your favorite hobby",
    prompt: "Tell me about your favorite hobby",
    difficulty: "Beginner",
    durationSec: 45,
  },
  {
    id: "weekend",
    title: "Describe your last weekend",
    prompt: "Describe what you did last weekend",
    difficulty: "Beginner",
    durationSec: 60,
  },
  {
    id: "city",
    title: "Your city in three sentences",
    prompt: "Describe your city in three sentences",
    difficulty: "Intermediate",
    durationSec: 60,
  },
  {
    id: "opinion",
    title: "An opinion you hold strongly",
    prompt: "Share one opinion you hold strongly, and explain why",
    difficulty: "Intermediate",
    durationSec: 75,
  },
  {
    id: "debate",
    title: "Should phones be allowed in class?",
    prompt: "Argue for or against phones in classrooms",
    difficulty: "Advanced",
    durationSec: 90,
  },
];
