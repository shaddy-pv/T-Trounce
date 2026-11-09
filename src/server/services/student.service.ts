import type { Db, Document, Filter } from "mongodb";
import { attemptScore, weakestMetric } from "@/lib/scoring";
import type { StudentRow, StudentStatus, StudentWeeklyReport } from "@/types";
import { requireDb } from "../db/client";
import type {
  AssignmentDoc,
  AttemptDoc,
  BatchTime,
  FlagDoc,
  SessionSeason,
  StudentDoc,
  UserDoc,
} from "../db/schemas";
import { toAttemptResult } from "./attempt.mapper";

const ROSTER_CACHE_TTL_MS = 15 * 1000;
const MAX_REPORT_ATTEMPTS = 500;
const MAX_PROFILE_ATTEMPTS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

interface RosterCacheEntry {
  data: StudentRow[];
  timestamp: number;
}
const rosterCache = new Map<string, RosterCacheEntry>();

export function invalidateRosterCache(): void {
  rosterCache.clear();
}

type RecentAttempt = Pick<
  AttemptDoc,
  | "durationSec"
  | "targetDurationSec"
  | "pronunciation"
  | "vocabulary"
  | "grammar"
  | "waveform"
  | "createdAt"
>;

/** Only the fields needed for summaries. Transcripts stay out of memory. */
const RECENT_ATTEMPT_FIELDS = {
  durationSec: "$durationSec",
  targetDurationSec: "$targetDurationSec",
  pronunciation: "$pronunciation",
  vocabulary: "$vocabulary",
  grammar: "$grammar",
  waveform: "$waveform",
  createdAt: "$createdAt",
};

/** Each student's two most recent attempts, computed in the database. */
async function latestAttemptsByStudent(
  db: Db,
  studentIds: string[],
): Promise<Map<string, RecentAttempt[]>> {
  const pipeline: Document[] = [
    { $match: { studentId: { $in: studentIds } } },
    {
      $group: {
        _id: "$studentId",
        attempts: {
          $topN: { n: 2, sortBy: { createdAt: -1 }, output: RECENT_ATTEMPT_FIELDS },
        },
      },
    },
  ];

  const rows = await db
    .collection("attempts")
    .aggregate<{ _id: string; attempts: RecentAttempt[] }>(pipeline)
    .toArray();
  return new Map(rows.map((row) => [row._id, row.attempts]));
}

/**
 * Builds a roster row from the student's real activity. Used by both the roster and the student
 * page, so the two always agree.
 */
function buildStudentRow(
  user: Pick<UserDoc, "id" | "name" | "phone" | "sessionSeason" | "batchTime" | "batchId">,
  studentDoc: StudentDoc | undefined,
  attempts: RecentAttempt[],
  pendingFlag: Pick<FlagDoc, "type" | "category"> | undefined,
  now: Date,
): StudentRow {
  const sessionSeason = user.sessionSeason || studentDoc?.sessionSeason || "summer";
  const batchTime = user.batchTime || studentDoc?.batchTime || "morning";
  const batchId = user.batchId || studentDoc?.batchId || `${sessionSeason}-${batchTime}`;

  const latest = attempts[0];
  let scorePct = 0;
  let trendPct = 0;
  let focus = "General";
  let lastActive = "Never";
  let inactiveDays = 0;
  let waveform = studentDoc?.waveform ?? [];

  if (latest) {
    scorePct = attemptScore(latest);
    focus = weakestMetric(latest);
    if (latest.waveform?.length) waveform = latest.waveform;
    if (attempts[1]) trendPct = scorePct - attemptScore(attempts[1]);

    const attemptDate = latest.createdAt ? new Date(latest.createdAt) : now;
    inactiveDays = Math.floor((now.getTime() - attemptDate.getTime()) / DAY_MS);
    lastActive =
      inactiveDays === 0 ? "Today" : inactiveDays === 1 ? "Yesterday" : `${inactiveDays}d ago`;
  }

  // Priority: open flag > low score > no recordings > long inactivity > teacher-set status
  let status: StudentStatus = studentDoc?.status ?? "on-track";
  let flagReason = studentDoc?.flagReason ?? undefined;

  if (pendingFlag) {
    status = "flagged";
    flagReason =
      pendingFlag.type === "student_request"
        ? `Help Request: ${pendingFlag.category || "Guidance"}`
        : pendingFlag.category || "Needs Teacher Review";
  } else if (latest && scorePct < 50) {
    status = "flagged";
    flagReason = `Low Fluency: ${scorePct}%`;
  } else if (!latest) {
    status = "nudge";
    flagReason = "No recordings yet";
  } else if (inactiveDays > 4) {
    status = "flagged";
    flagReason = `Inactive ${inactiveDays}d`;
  } else if (inactiveDays > 2) {
    status = "nudge";
    flagReason = `Inactive ${inactiveDays}d`;
  }

  return {
    id: user.id,
    name: user.name,
    status,
    focus,
    lastActive,
    scorePct,
    trendPct,
    waveform,
    inactiveDays,
    flagReason,
    sessionSeason,
    batchTime,
    batchId,
    phone: user.phone || studentDoc?.phone,
  };
}

const USER_SUMMARY_PROJECTION = {
  id: 1,
  name: 1,
  email: 1,
  phone: 1,
  sessionSeason: 1,
  batchTime: 1,
  batchId: 1,
} as const;

export class StudentService {
  /**
   * Fetch batch students with optional session & batch filtering
   */
  static async getRoster(filter?: {
    session?: string;
    batch?: string;
    batchId?: string;
  }): Promise<StudentRow[]> {
    const cacheKey = JSON.stringify(filter || {});
    const cached = rosterCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ROSTER_CACHE_TTL_MS) {
      return cached.data;
    }

    const db = await requireDb();

    const userQuery: Filter<UserDoc> = { role: "student" };
    if (filter?.session && filter.session !== "all") {
      userQuery.sessionSeason = filter.session as SessionSeason;
    }
    if (filter?.batch && filter.batch !== "all") {
      userQuery.batchTime = filter.batch as BatchTime;
    }

    const studentUsers = await db
      .collection<UserDoc>("users")
      .find(userQuery, { projection: USER_SUMMARY_PROJECTION })
      .toArray();

    const userIds = studentUsers.map((user) => user.id);
    const [studentDocs, pendingFlags] = await Promise.all([
      db
        .collection<StudentDoc>("students")
        .find({ id: { $in: userIds } })
        .toArray(),
      db
        .collection<FlagDoc>("flags")
        .find(
          { status: "pending", studentId: { $in: userIds } },
          { projection: { studentId: 1, type: 1, category: 1 } },
        )
        .toArray(),
    ]);
    const studentDocsById = new Map(studentDocs.map((doc) => [doc.id, doc]));
    const pendingFlagsById = new Map(pendingFlags.map((flag) => [flag.studentId, flag]));

    // Older attempts may have been stored under the student's email instead of their ID.
    const lookupIds = new Set<string>();
    for (const user of studentUsers) {
      lookupIds.add(user.id);
      if (user.email) lookupIds.add(user.email.toLowerCase());
    }
    const attemptsById = await latestAttemptsByStudent(db, [...lookupIds]);

    const now = new Date();
    const results: StudentRow[] = [];

    for (const user of studentUsers) {
      const attempts =
        attemptsById.get(user.id) ??
        (user.email ? attemptsById.get(user.email.toLowerCase()) : undefined) ??
        [];
      const row = buildStudentRow(
        user,
        studentDocsById.get(user.id),
        attempts,
        pendingFlagsById.get(user.id),
        now,
      );
      if (filter?.batchId && filter.batchId !== "all" && row.batchId !== filter.batchId) continue;
      results.push(row);
    }

    // Flagged first, then most recently active
    results.sort((a, b) => {
      if (a.status === "flagged" && b.status !== "flagged") return -1;
      if (a.status !== "flagged" && b.status === "flagged") return 1;
      if (a.lastActive === "Never" && b.lastActive !== "Never") return 1;
      if (a.lastActive !== "Never" && b.lastActive === "Never") return -1;
      return (a.inactiveDays ?? 999) - (b.inactiveDays ?? 999);
    });

    rosterCache.set(cacheKey, { data: results, timestamp: Date.now() });
    return results;
  }

  /**
   * Fetch a weekly report with real attempt counts and scores
   */
  static async getStudentWeeklyReport(studentId: string): Promise<StudentWeeklyReport | null> {
    const db = await requireDb();

    const student = await this.getStudentById(studentId);
    if (!student) return null;

    const user = await db
      .collection<UserDoc>("users")
      .findOne(
        { $or: [{ id: studentId }, { email: studentId.toLowerCase() }] },
        { projection: { id: 1, email: 1 } },
      );
    const searchIds = [
      ...new Set([studentId, user?.id, user?.email?.toLowerCase()].filter(Boolean) as string[]),
    ];

    const allAttempts = await db
      .collection<AttemptDoc>("attempts")
      .find({ studentId: { $in: searchIds } }, { projection: { transcript: 0 } })
      .sort({ createdAt: -1 })
      .limit(MAX_REPORT_ATTEMPTS)
      .toArray();

    const nowMs = Date.now();
    const timeOf = (a: AttemptDoc) => (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const weeklyAttempts = allAttempts.filter((a) => timeOf(a) >= nowMs - 7 * DAY_MS);
    const previousWeekAttempts = allAttempts.filter((a) => {
      const time = timeOf(a);
      return time >= nowMs - 14 * DAY_MS && time < nowMs - 7 * DAY_MS;
    });

    const average = (items: AttemptDoc[], pick: (a: AttemptDoc) => number) =>
      Math.round(items.reduce((sum, a) => sum + pick(a), 0) / items.length);

    const attemptsThisWeek = weeklyAttempts.length;
    let pronunciation = 0;
    let vocabulary = 0;
    let grammar = 0;
    let scorePct = 0;
    let trendPct = student.trendPct || 0;
    let waveform = student.waveform || [];

    if (attemptsThisWeek > 0) {
      pronunciation = average(weeklyAttempts, (a) => a.pronunciation ?? 70);
      vocabulary = average(weeklyAttempts, (a) => a.vocabulary ?? 70);
      grammar = average(weeklyAttempts, (a) => a.grammar ?? 70);
      scorePct = average(weeklyAttempts, attemptScore);
      if (weeklyAttempts[0].waveform?.length) waveform = weeklyAttempts[0].waveform;

      if (previousWeekAttempts.length > 0) {
        trendPct = scorePct - average(previousWeekAttempts, attemptScore);
      } else if (allAttempts.length > attemptsThisWeek) {
        trendPct = scorePct - attemptScore(allAttempts[attemptsThisWeek]);
      }
    } else if (allAttempts.length > 0) {
      // No attempts in the current 7-day window, so report the most recent one.
      const latest = allAttempts[0];
      pronunciation = latest.pronunciation ?? 70;
      vocabulary = latest.vocabulary ?? 70;
      grammar = latest.grammar ?? 70;
      scorePct = attemptScore(latest);
      if (latest.waveform?.length) waveform = latest.waveform;
    }

    const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
    const session = student.sessionSeason || "summer";
    const batch = student.batchTime || "morning";

    const trendText =
      attemptsThisWeek === 0
        ? "No voice submissions recorded this week. Regular daily practice recommended."
        : trendPct >= 0
          ? `Score up ${trendPct}%, clear stretches are getting longer.`
          : `Score down ${Math.abs(trendPct)}%, please encourage daily practice.`;

    return {
      student: {
        ...student,
        scorePct: scorePct || student.scorePct,
        trendPct,
        waveform,
      },
      attemptsThisWeek,
      totalAttempts: allAttempts.length,
      pronunciation,
      vocabulary,
      grammar,
      scorePct,
      trendPct,
      waveform,
      trendText,
      batchLabel: `${capitalize(session)} Session · ${capitalize(batch)} Batch`,
      hasActivity: allAttempts.length > 0,
    };
  }

  /**
   * Fetch a single student by ID, using the same logic as the roster
   */
  static async getStudentById(id: string): Promise<StudentRow | null> {
    const db = await requireDb();

    const user = await db.collection<UserDoc>("users").findOne(
      {
        $or: [{ id }, { email: id.toLowerCase() }, { username: id.toLowerCase() }],
      },
      { projection: USER_SUMMARY_PROJECTION },
    );

    const studentId = user?.id ?? id;
    const studentDoc =
      (await db.collection<StudentDoc>("students").findOne({ id: studentId })) ?? undefined;
    if (!user && !studentDoc) return null;

    const lookupIds = [
      ...new Set([studentId, user?.email?.toLowerCase()].filter(Boolean) as string[]),
    ];
    const [attemptsById, pendingFlag] = await Promise.all([
      latestAttemptsByStudent(db, lookupIds),
      db
        .collection<FlagDoc>("flags")
        .findOne(
          { studentId, status: "pending" },
          { projection: { type: 1, category: 1 }, sort: { createdAt: -1 } },
        ),
    ]);
    const attempts = lookupIds.flatMap((lookupId) => attemptsById.get(lookupId) ?? []).slice(0, 2);

    const person = user ?? {
      id: studentId,
      name: studentDoc?.name ?? "Student",
      phone: studentDoc?.phone,
      sessionSeason: studentDoc?.sessionSeason,
      batchTime: studentDoc?.batchTime,
      batchId: studentDoc?.batchId,
    };

    return buildStudentRow(person, studentDoc, attempts, pendingFlag ?? undefined, new Date());
  }

  /**
   * Fetch a complete student profile with homework statistics and audio attempts
   */
  static async getStudentProfile(studentId: string) {
    const student = await this.getStudentById(studentId);
    if (!student) return null;

    const db = await requireDb();
    const session = student.sessionSeason || "summer";
    const batch = student.batchTime || "morning";

    const [assignments, attempts] = await Promise.all([
      db
        .collection<AssignmentDoc>("assignments")
        .find({
          $or: [
            { batchId: student.batchId },
            { targetSession: session as SessionSeason, targetBatch: batch as BatchTime },
          ],
        })
        .toArray(),
      db
        .collection<AttemptDoc>("attempts")
        .find({ studentId: student.id })
        .sort({ createdAt: -1 })
        .limit(MAX_PROFILE_ATTEMPTS)
        .toArray(),
    ]);

    const completedAssignmentIds = new Set(
      attempts.filter((a) => a.assignmentId).map((a) => a.assignmentId),
    );
    const totalReceived = assignments.length;
    const completed = assignments.filter((a) => completedAssignmentIds.has(a.id)).length;

    return {
      student,
      homeworkStats: {
        totalReceived,
        completed,
        pending: Math.max(0, totalReceived - completed),
        assignments: assignments.map((a) => ({
          id: a.id,
          title: a.title,
          instructions: a.instructions,
          prompt: a.prompt,
          difficulty: a.difficulty,
          durationSec: a.durationSec,
          dueDate: a.dueDate,
          completed: completedAssignmentIds.has(a.id),
        })),
      },
      attempts: attempts.map(toAttemptResult),
    };
  }

  /**
   * Update student status (e.g. resolve a flag or send a nudge).
   * Returns false if the student has no roster record.
   */
  static async updateStatus(studentId: string, status: StudentStatus): Promise<boolean> {
    const db = await requireDb();
    const result = await db.collection<StudentDoc>("students").updateOne(
      { id: studentId },
      {
        $set: { status, updatedAt: new Date() },
        ...(status === "on-track" ? { $unset: { flagReason: "" } } : {}),
      },
    );
    invalidateRosterCache();
    return result.matchedCount > 0;
  }
}
