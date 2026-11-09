import { modules as memoryModules } from "@/lib/tarang-data";
import type { Module } from "@/types";
import { getDb } from "../db/client";
import type { ModuleDoc } from "../db/schemas";

function toModule(doc: ModuleDoc): Module {
  return {
    id: doc.id,
    title: doc.title,
    prompt: doc.prompt,
    difficulty: doc.difficulty,
    durationSec: doc.durationSec,
  };
}

export class ModuleService {
  /**
   * Fetch all practice curriculum modules. The curriculum is static content, so the built-in copy
   * is a safe fallback if the database cannot be reached.
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
        if (docs.length > 0) return docs.map(toModule);
      }
    } catch (err) {
      console.error("[ModuleService.getAllModules Error]", (err as Error).message);
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
        if (doc) return toModule(doc);
      }
    } catch (err) {
      console.error("[ModuleService.getModuleById Error]", (err as Error).message);
    }
    return memoryModules.find((m) => m.id === moduleId) ?? null;
  }
}
