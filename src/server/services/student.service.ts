import { getDb } from "../db/client";
import type { StudentDoc } from "../db/schemas";
import type { StudentRow, StudentStatus } from "@/types";

export class StudentService {
  /**
   * Fetch all batch students with optional session & batch filtering
   */
  static async getRoster(filter?: {
    session?: string;
    batch?: string;
    batchId?: string;
  }): Promise<StudentRow[]> {
    try {
      const db = await getDb();
      if (db) {
        // Fetch registered student users from MongoDB
        const userQuery: import("mongodb").Filter<import("../db/schemas").UserDoc> = { role: "student" };
        if (filter?.session && filter.session !== "all") {
          userQuery.sessionSeason = filter.session as import("../db/schemas").SessionSeason;
        }
        if (filter?.batch && filter.batch !== "all") {
          userQuery.batchTime = filter.batch as import("../db/schemas").BatchTime;
        }

        const studentUsers = await db.collection<import("../db/schemas").UserDoc>("users").find(userQuery).toArray();

        // Also fetch docs from students collection for any additional metadata or status updates
        const studentDocs = await db.collection<StudentDoc>("students").find({}).toArray();
        const studentDocsMap = new Map(studentDocs.map((s) => [s.id, s]));

        const now = new Date();
        const results: StudentRow[] = [];

        for (const user of studentUsers) {
          const studentDoc = studentDocsMap.get(user.id);
          const sessionSeason = user.sessionSeason || studentDoc?.sessionSeason || "summer";
          const batchTime = user.batchTime || studentDoc?.batchTime || "morning";
          const batchId = user.batchId || studentDoc?.batchId || `${sessionSeason}-${batchTime}`;

          if (filter?.batchId && filter.batchId !== "all" && batchId !== filter.batchId) {
            continue;
          }

          // Fetch the student's latest attempts from MongoDB
          const attempts = await db
            .collection<import("../db/schemas").AttemptDoc>("attempts")
            .find({
              $or: [{ studentId: user.id }, { studentId: user.email.toLowerCase() }],
            })
            .sort({ createdAt: -1 })
            .limit(2)
            .toArray();

          let scorePct = 0;
          let trendPct = 0;
          let focus = "—";
          let waveform = studentDoc?.waveform ?? [];
          let lastActive = "Never";
          let inactiveDays = 0;
          let status: StudentStatus = studentDoc?.status ?? "on-track";
          let flagReason = studentDoc?.flagReason;

          if (attempts.length > 0) {
            const latest = attempts[0];
            // Completion percentage = recorded seconds / target seconds
            scorePct =
              latest.targetDurationSec && latest.targetDurationSec > 0
                ? Math.min(100, Math.round((latest.durationSec / latest.targetDurationSec) * 100))
                : Math.round(
                    ((latest.pronunciation ?? 70) +
                      (latest.vocabulary ?? 70) +
                      (latest.grammar ?? 70)) /
                      3,
                  );

            // Derive weakest skill for focus
            const minScore = Math.min(
              latest.pronunciation ?? 70,
              latest.vocabulary ?? 70,
              latest.grammar ?? 70,
            );
            if (minScore === latest.pronunciation) focus = "Pronunciation";
            else if (minScore === latest.vocabulary) focus = "Vocabulary";
            else focus = "Grammar";

            waveform = latest.waveform && latest.waveform.length > 0 ? latest.waveform : waveform;

            // Compute trend compared to previous attempt
            if (attempts.length > 1) {
              const prev = attempts[1];
              const prevScore =
                prev.targetDurationSec && prev.targetDurationSec > 0
                  ? Math.min(100, Math.round((prev.durationSec / prev.targetDurationSec) * 100))
                  : Math.round(
                      ((prev.pronunciation ?? 70) +
                        (prev.vocabulary ?? 70) +
                        (prev.grammar ?? 70)) /
                        3,
                    );
              trendPct = scorePct - prevScore;
            }

            // Calculate last active from attempt createdAt
            const attemptDate = latest.createdAt ? new Date(latest.createdAt) : now;
            const diffMs = now.getTime() - attemptDate.getTime();
            inactiveDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (inactiveDays === 0) {
              lastActive = "Today";
            } else if (inactiveDays === 1) {
              lastActive = "Yesterday";
            } else {
              lastActive = `${inactiveDays}d ago`;
            }

            if (inactiveDays > 4) {
              status = "flagged";
              flagReason = `Inactive ${inactiveDays}d`;
            } else if (inactiveDays > 2) {
              status = "nudge";
            } else {
              status = "on-track";
            }
          }

          results.push({
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
          });
        }

        // Sort: Most recently active students on top (e.g. Today -> Yesterday -> 2d ago -> Never)
        results.sort((a, b) => {
          if (a.lastActive === "Never" && b.lastActive !== "Never") return 1;
          if (a.lastActive !== "Never" && b.lastActive === "Never") return -1;
          return (a.inactiveDays ?? 999) - (b.inactiveDays ?? 999);
        });

        return results;
      }
    } catch (err) {
      console.error("[StudentService.getRoster Error]", err);
    }
    return [];
  }

  /**
   * Fetch single student dossier by ID
   */
  static async getStudentById(id: string): Promise<StudentRow | null> {
    try {
      const db = await getDb();
      if (db) {
        let student: StudentDoc | null = await db
          .collection<StudentDoc>("students")
          .findOne({ id });

        if (!student) {
          const user = await db.collection<import("../db/schemas").UserDoc>("users").findOne({
            $or: [
              { id },
              { email: id.toLowerCase() },
              { username: id.toLowerCase() },
              { name: id },
            ],
          });
          if (user) {
            student = await db.collection<StudentDoc>("students").findOne({ id: user.id });
            if (!student) {
              const sessionSeason = user.sessionSeason || "summer";
              const batchTime = user.batchTime || "morning";
              student = {
                id: user.id,
                name: user.name,
                status: "on-track",
                focus: "Introductory module practice",
                lastActive: "Today",
                scorePct: 0,
                trendPct: 0,
                waveform: [],
                sessionSeason,
                batchTime,
                batchId: `${sessionSeason}-${batchTime}`,
                updatedAt: new Date(),
              };
            }
          }
        }

        if (student) {
          const now = new Date();
          let calcInactiveDays = student.inactiveDays ?? 0;
          let calcStatus = student.status;
          let calcLastActive = student.lastActive;

          if (student.updatedAt) {
            const diffMs = now.getTime() - new Date(student.updatedAt).getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            calcInactiveDays = diffDays;

            if (diffDays === 0) {
              calcLastActive = "Today";
            } else if (diffDays === 1) {
              calcLastActive = "Yesterday";
            } else {
              calcLastActive = `${diffDays}d ago`;
            }

            if (diffDays > 4) {
              calcStatus = "flagged";
            } else if (diffDays > 2) {
              calcStatus = "nudge";
            } else {
              calcStatus = "on-track";
            }
          }

          return {
            id: student.id,
            name: student.name,
            status: calcStatus,
            focus: student.focus,
            lastActive: calcLastActive,
            scorePct: student.scorePct,
            trendPct: student.trendPct,
            waveform: student.waveform,
            inactiveDays: calcInactiveDays,
            flagReason: student.flagReason,
            sessionSeason: student.sessionSeason,
            batchTime: student.batchTime,
            batchId: student.batchId,
          };
        }
      }
    } catch (err) {
      console.error("[StudentService.getStudentById Error]", err);
    }
    return null;
  }

  /**
   * Fetch complete student profile with homework statistics and audio attempts
   */
  static async getStudentProfile(studentId: string) {
    const student = await this.getStudentById(studentId);
    if (!student) return null;

    const db = await getDb();
    let totalReceived = 0;
    let completed = 0;
    let attempts: import("../db/schemas").AttemptDoc[] = [];
    let assignments: import("../db/schemas").AssignmentDoc[] = [];

    if (db) {
      const session = student.sessionSeason || "summer";
      const batch = student.batchTime || "morning";

      // 1. Fetch assignments targeted to student's batch
      assignments = await db
        .collection<import("../db/schemas").AssignmentDoc>("assignments")
        .find({
          $or: [
            { batchId: student.batchId },
            {
              targetSession: session as import("../db/schemas").SessionSeason,
              targetBatch: batch as import("../db/schemas").BatchTime,
            },
          ],
        })
        .toArray();
      totalReceived = assignments.length;

      // 2. Fetch attempts recorded by this student
      attempts = await db
        .collection<import("../db/schemas").AttemptDoc>("attempts")
        .find({ studentId })
        .sort({ createdAt: -1 })
        .toArray();

      // 3. Count completed homework assignments
      const completedAssignmentIds = new Set(
        attempts.filter((a) => a.assignmentId).map((a) => a.assignmentId),
      );
      completed = completedAssignmentIds.size;
    }

    const pending = Math.max(0, totalReceived - completed);

    return {
      student,
      homeworkStats: {
        totalReceived,
        completed,
        pending,
        assignments: assignments.map((a) => ({
          id: a.id,
          title: a.title,
          instructions: a.instructions,
          prompt: a.prompt,
          difficulty: a.difficulty,
          durationSec: a.durationSec,
          dueDate: a.dueDate,
          completed: attempts.some((att) => att.assignmentId === a.id),
        })),
      },
      attempts: attempts.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        moduleId: a.moduleId,
        assignmentId: a.assignmentId,
        assignmentTitle: a.assignmentTitle,
        prompt: a.prompt,
        transcript: a.transcript || "Spoken response recorded by student.",
        audioUrl: a.audioUrl,
        durationSec: a.durationSec,
        targetDurationSec: a.targetDurationSec,
        pronunciation: a.pronunciation,
        vocabulary: a.vocabulary,
        grammar: a.grammar,
        fillerCount: a.fillerCount,
        pauseCount: a.pauseCount,
        feedback: a.feedback,
        waveform: a.waveform,
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
      })),
    };
  }

  /**
   * Update student status (e.g. resolve flag or send nudge)
   */
  static async updateStatus(studentId: string, status: StudentStatus): Promise<boolean> {
    try {
      const db = await getDb();
      if (db) {
        await db.collection<StudentDoc>("students").updateOne(
          { id: studentId },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );
        return true;
      }
    } catch (err) {
      console.error("[StudentService.updateStatus Error]", err);
    }
    return true;
  }
}
