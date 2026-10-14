import { getDb } from "../db/client";
import type { AppSettingsDoc } from "../db/schemas";

export interface AppSettings {
  liveTranscriptionEnabled: boolean;
  postTranscriptionEnabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

// In-memory fallback if database is temporarily connecting or unseeded
let inMemorySettings: AppSettings = {
  liveTranscriptionEnabled: false, // Default: DISABLED as requested
  postTranscriptionEnabled: true, // Default: ENABLED
  updatedAt: new Date().toISOString(),
};

export class SettingsService {
  /**
   * Retrieves current application settings.
   */
  static async getSettings(): Promise<AppSettings> {
    try {
      const db = await getDb();
      if (!db) return inMemorySettings;

      const col = db.collection<AppSettingsDoc>("settings");
      const doc = await col.findOne({ id: "global" });

      if (!doc) {
        // Initialize default record
        const initialDoc: AppSettingsDoc = {
          id: "global",
          liveTranscriptionEnabled: false,
          postTranscriptionEnabled: true,
          updatedAt: new Date(),
        };
        await col.insertOne(initialDoc);
        inMemorySettings = {
          liveTranscriptionEnabled: false,
          postTranscriptionEnabled: true,
          updatedAt: initialDoc.updatedAt.toISOString(),
        };
        return inMemorySettings;
      }

      inMemorySettings = {
        liveTranscriptionEnabled: Boolean(doc.liveTranscriptionEnabled),
        postTranscriptionEnabled: doc.postTranscriptionEnabled ?? true,
        updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
        updatedBy: doc.updatedBy,
      };

      return inMemorySettings;
    } catch (err) {
      console.warn("[SettingsService.getSettings] DB error, using fallback:", err);
      return inMemorySettings;
    }
  }

  /**
   * Updates application settings.
   */
  static async updateSettings(
    updates: { liveTranscriptionEnabled?: boolean; postTranscriptionEnabled?: boolean },
    userId?: string,
  ): Promise<AppSettings> {
    const current = await this.getSettings();
    const liveVal =
      updates.liveTranscriptionEnabled !== undefined
        ? updates.liveTranscriptionEnabled
        : current.liveTranscriptionEnabled;
    const postVal =
      updates.postTranscriptionEnabled !== undefined
        ? updates.postTranscriptionEnabled
        : current.postTranscriptionEnabled;

    const updatedAt = new Date();
    inMemorySettings = {
      liveTranscriptionEnabled: liveVal,
      postTranscriptionEnabled: postVal,
      updatedAt: updatedAt.toISOString(),
      updatedBy: userId,
    };

    try {
      const db = await getDb();
      if (db) {
        const col = db.collection<AppSettingsDoc>("settings");
        await col.updateOne(
          { id: "global" },
          {
            $set: {
              id: "global",
              liveTranscriptionEnabled: liveVal,
              postTranscriptionEnabled: postVal,
              updatedAt,
              updatedBy: userId,
            },
          },
          { upsert: true },
        );
      }
    } catch (err) {
      console.warn("[SettingsService.updateSettings] DB save warning:", err);
    }

    return inMemorySettings;
  }
}
