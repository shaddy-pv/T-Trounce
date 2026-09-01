import { getDb } from "../db/client";
import type { ModuleDoc } from "../db/schemas";
import type { Module } from "@/types";
import { modules as memoryModules } from "@/lib/tarang-data";

export class ModuleService {
  /**
   * Fetch all practice curriculum modules
   */
  static async getAllModules(): Promise<Module[]> {
    try {
      const db = await getDb();
      if (db) {
        const docs = await db
          .collection<ModuleDoc>("modules")
          .find({})
          .sort({ order: 1 })
          .toArray();
        if (docs.length > 0) {
          return docs.map(({ id, title, prompt, difficulty, durationSec, completed }) => ({
            id,
            title,
            prompt,
            difficulty,
            durationSec,
            completed,
          }));
        }
      }
    } catch (err) {
      console.error("[ModuleService.getAllModules Error]", err);
    }
    return memoryModules;
  }

  /**
   * Fetch module by ID
   */
  static async getModuleById(moduleId: string): Promise<Module | null> {
    try {
      const db = await getDb();
      if (db) {
        const doc = await db.collection<ModuleDoc>("modules").findOne({ id: moduleId });
        if (doc) {
          return {
            id: doc.id,
            title: doc.title,
            prompt: doc.prompt,
            difficulty: doc.difficulty,
            durationSec: doc.durationSec,
            completed: doc.completed,
          };
        }
      }
    } catch (err) {
      console.error("[ModuleService.getModuleById Error]", err);
    }
    return memoryModules.find((m) => m.id === moduleId) ?? null;
  }

  /**
   * Mark module as completed
   */
  static async markCompleted(moduleId: string): Promise<boolean> {
    try {
      const db = await getDb();
      if (db) {
        await db
          .collection<ModuleDoc>("modules")
          .updateOne({ id: moduleId }, { $set: { completed: true } });
        return true;
      }
    } catch (err) {
      console.error("[ModuleService.markCompleted Error]", err);
    }
    return true;
  }
}
