import { getDb } from "../db/client";
import type { StudentDoc } from "../db/schemas";
import type { StudentRow, StudentStatus } from "@/types";
import { studentRoster as memoryRoster } from "@/lib/tarang-data";

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
        const query: import("mongodb").Filter<StudentDoc> = {};
        if (filter?.batchId && filter.batchId !== "all") {
          query.batchId = filter.batchId;
        } else {
          if (filter?.session && filter.session !== "all") {
            query.sessionSeason = filter.session as import("../db/schemas").SessionSeason;
          }
          if (filter?.batch && filter.batch !== "all") {
            query.batchTime = filter.batch as import("../db/schemas").BatchTime;
          }
        }

        const docs = await db.collection<StudentDoc>("students").find(query).toArray();
        if (docs.length > 0) {
          const now = new Date();
          return docs.map(
            ({
              id,
              name,
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
              updatedAt,
            }) => {
              // Auto-calc status based on updatedAt
              let calcInactiveDays = inactiveDays ?? 0;
              let calcStatus = status;
              let calcLastActive = lastActive;

              if (updatedAt) {
                const diffMs = now.getTime() - new Date(updatedAt).getTime();
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
                id,
                name,
                status: calcStatus,
                focus,
                lastActive: calcLastActive,
                scorePct,
                trendPct,
                waveform,
                inactiveDays: calcInactiveDays,
                flagReason,
                sessionSeason,
                batchTime,
                batchId,
              };
            },
          );
        }
      }
    } catch (err) {
      console.error("[StudentService.getRoster Error]", err);
    }
    return memoryRoster;
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
                scorePct: 85,
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
    return memoryRoster.find((s) => s.id === id) ?? null;
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
          difficulty: a.difficulty,
          dueDate: a.dueDate,
          completed: attempts.some((att) => att.assignmentId === a.id),
        })),
      },
      attempts: attempts.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        moduleId: a.moduleId,
        assignmentId: a.assignmentId,
        prompt: a.prompt,
        transcript: a.transcript || "Spoken response recorded by student.",
        audioUrl: a.audioUrl,
        durationSec: a.durationSec,
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
