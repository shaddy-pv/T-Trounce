import { getDb, requireDb } from "../db/client";
import type { AppSettingsDoc } from "../db/schemas";

export interface AppSettings {
  liveTranscriptionEnabled: boolean;
  postTranscriptionEnabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULTS = {
  liveTranscriptionEnabled: false,
  postTranscriptionEnabled: true,
};

/** Last value read from the database, used if it becomes temporarily unreachable. */
let lastKnownSettings: AppSettings = { ...DEFAULTS, updatedAt: new Date().toISOString() };

function fromDoc(doc: AppSettingsDoc): AppSettings {
  return {
    liveTranscriptionEnabled: Boolean(doc.liveTranscriptionEnabled),
    postTranscriptionEnabled: doc.postTranscriptionEnabled ?? true,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
    updatedBy: doc.updatedBy,
  };
}

export class SettingsService {
  /**
   * Retrieves current application settings.
   */
  static async getSettings(): Promise<AppSettings> {
    try {
      const db = await getDb();
      if (!db) return lastKnownSettings;

      // An atomic upsert, so concurrent first reads cannot create duplicate documents.
      const doc = await db
        .collection<AppSettingsDoc>("settings")
        .findOneAndUpdate(
          { id: "global" },
          { $setOnInsert: { ...DEFAULTS, updatedAt: new Date() } },
          { upsert: true, returnDocument: "after" },
        );

      if (doc) lastKnownSettings = fromDoc(doc);
      return lastKnownSettings;
    } catch (err) {
      console.warn(
        "[SettingsService.getSettings] Using last known values:",
        (err as Error).message,
      );
      return lastKnownSettings;
    }
  }

  /**
   * Updates application settings. Throws if the change could not be saved, so the admin screen
   * shows the real state rather than a change that was never stored.
   */
  static async updateSettings(
    updates: { liveTranscriptionEnabled?: boolean; postTranscriptionEnabled?: boolean },
    userId?: string,
  ): Promise<AppSettings> {
    const db = await requireDb();
    const changes: Partial<AppSettingsDoc> = { updatedAt: new Date(), updatedBy: userId };
    if (updates.liveTranscriptionEnabled !== undefined) {
      changes.liveTranscriptionEnabled = updates.liveTranscriptionEnabled;
    }
    if (updates.postTranscriptionEnabled !== undefined) {
      changes.postTranscriptionEnabled = updates.postTranscriptionEnabled;
    }

    const doc = await db
      .collection<AppSettingsDoc>("settings")
      .findOneAndUpdate(
        { id: "global" },
        { $set: changes },
        { upsert: true, returnDocument: "after" },
      );

    if (doc) lastKnownSettings = fromDoc(doc);
    return lastKnownSettings;
  }
}
