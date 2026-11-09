import { createServerFn } from "@tanstack/react-start";
import { setCookie, deleteCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { isFaculty } from "@/lib/roles";
import { forbidden, notFound, AppError } from "./errors";
import {
  authenticatedMiddleware,
  teacherOnlyMiddleware,
  adminOnlyMiddleware,
  readSessionCookie,
  COOKIE_NAME,
  LEGACY_COOKIE_NAME,
} from "./middleware/auth.middleware";
import { getClientIp } from "./middleware/client-ip";
import {
  assertLoginAllowed,
  enforceRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "./middleware/rate-limiter";
import { ModuleService } from "./services/module.service";
import { StudentService } from "./services/student.service";
import { AttemptService } from "./services/attempt.service";
import { AuthService, type SessionPayload } from "./services/auth.service";
import { UserService, type UserPublic } from "./services/user.service";
import {
  AssignmentService,
  type AssignmentPublic,
  type AssignmentSubmissionsData,
} from "./services/assignment.service";
import { MessageService } from "./services/message.service";
import { TranscriptionService } from "./services/transcription.service";
import { FlagService } from "./services/flag.service";
import { SettingsService, type AppSettings } from "./services/settings.service";

import { LoginInputSchema } from "./validators/auth.validator";
import { UpdateAppSettingsInputSchema } from "./validators/settings.validator";
import { CreateUserInputSchema, DeleteUserInputSchema } from "./validators/user.validator";
import {
  CreateAssignmentInputSchema,
  DeleteAssignmentInputSchema,
  AssignmentFilterSchema,
  SendReminderInputSchema,
} from "./validators/assignment.validator";
import {
  SaveAttemptInputSchema,
  StreamTranscribeInputSchema,
  UpdateAttemptTranscriptInputSchema,
} from "./validators/attempt.validator";
import {
  UpdateStudentStatusInputSchema,
  StudentRosterFilterSchema,
} from "./validators/student.validator";
import {
  CreateMessageInputSchema,
  MarkMessageReadInputSchema,
} from "./validators/message.validator";
import {
  CreateFlagInputSchema,
  ResolveFlagInputSchema,
  FlagFilterSchema,
} from "./validators/flag.validator";
import type {
  Module,
  StudentRow,
  StudentWeeklyReport,
  AttemptResult,
  DirectMessagePublic,
  FlagItem,
} from "@/types";

const IdSchema = z.string().min(1).max(200);
const MINUTE = 60 * 1000;

type AuthedContext = { context: unknown };

const sessionUser = ({ context }: AuthedContext) => (context as { user: SessionPayload }).user;

/** Teachers and admins may act on any student. Students may only act on their own records. */
function assertFacultyOrSelf(user: SessionPayload, studentId: string, message: string): void {
  if (!isFaculty(user) && user.userId !== studentId) throw forbidden(message);
}

/**
 * Server Function: Authenticate user and issue secure HTTP-only session cookie
 */
export const loginFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => LoginInputSchema.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const ip = getClientIp();
    assertLoginAllowed(email, ip);

    const user = await AuthService.authenticateUserWithRole(email, data.passwordPlain, data.role);
    if (!user) {
      recordLoginFailure(email, ip);
      throw new AppError("Invalid email or password", 401);
    }
    recordLoginSuccess(email, ip);

    const token = await AuthService.createSessionToken(user);
    setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      batchId: user.batchId,
      sessionSeason: user.sessionSeason,
      batchTime: user.batchTime,
    };
  });

/**
 * Server Function: Logout & invalidate session cookie
 */
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(COOKIE_NAME, { path: "/" });
  deleteCookie(LEGACY_COOKIE_NAME, { path: "/" });
  return { success: true };
});

/**
 * Server Function: Get Current Session
 */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionPayload | null> => {
    return await AuthService.resolveSession(readSessionCookie());
  },
);

/**
 * Server Function: Fetch all users for Admin/Teacher console (Protected: Faculty/Admin)
 */
export const fetchUsersFn = createServerFn({ method: "GET" })
  .middleware([teacherOnlyMiddleware])
  .handler(async (): Promise<UserPublic[]> => {
    return await UserService.listUsers();
  });

/**
 * Server Function: Create a new User (Protected: Faculty/Admin)
 */
export const createUserFn = createServerFn({ method: "POST" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => CreateUserInputSchema.parse(input))
  .handler(async ({ data }): Promise<UserPublic> => {
    return await UserService.createUser(data);
  });

/**
 * Server Function: Delete a User by ID (Protected: Admin Only)
 */
export const deleteUserFn = createServerFn({ method: "POST" })
  .middleware([adminOnlyMiddleware])
  .validator((input: unknown) => DeleteUserInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const success = await UserService.deleteUser(data.userId);
    return { success };
  });

/**
 * Server Function: Fetch all practice curriculum modules (Protected: Authenticated)
 */
export const fetchModulesFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async (): Promise<Module[]> => {
    return await ModuleService.getAllModules();
  });

/**
 * Server Function: Fetch single module by ID (Protected: Authenticated)
 */
export const fetchModuleByIdFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data: moduleId }): Promise<Module | null> => {
    return await ModuleService.getModuleById(moduleId);
  });

/**
 * Server Function: Fetch batch student roster (Protected: Faculty/Admin)
 */
export const fetchStudentRosterFn = createServerFn({ method: "GET" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => StudentRosterFilterSchema.parse(input))
  .handler(async ({ data }): Promise<StudentRow[]> => {
    return await StudentService.getRoster(data);
  });

/**
 * Server Function: Fetch homework assignments (Protected: Authenticated)
 */
export const fetchAssignmentsFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => AssignmentFilterSchema.parse(input))
  .handler(async ({ data }): Promise<AssignmentPublic[]> => {
    const filter = data
      ? {
          session: data.session === "all" ? undefined : data.session,
          batch: data.batch === "all" ? undefined : data.batch,
          batchId: data.batchId,
        }
      : undefined;
    return await AssignmentService.listAssignments(filter);
  });

/**
 * Server Function: Create homework assignment (Protected: Faculty/Admin)
 */
export const createAssignmentFn = createServerFn({ method: "POST" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => CreateAssignmentInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AssignmentPublic> => {
    const user = sessionUser({ context });
    return await AssignmentService.createAssignment({
      ...data,
      teacherId: user.userId,
      teacherName: user.name,
    });
  });

/**
 * Server Function: Fetch single homework assignment by ID (Protected: Authenticated)
 */
export const fetchAssignmentByIdFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data: assignmentId }): Promise<AssignmentPublic | null> => {
    return await AssignmentService.getAssignmentById(assignmentId);
  });

/**
 * Server Function: Delete homework assignment (Protected: Faculty/Admin)
 */
export const deleteAssignmentFn = createServerFn({ method: "POST" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => DeleteAssignmentInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const success = await AssignmentService.deleteAssignment(data.id);
    return { success };
  });

/**
 * Server Function: Fetch submissions and pending roster for an assignment (Protected: Faculty/Admin)
 */
export const fetchAssignmentSubmissionsFn = createServerFn({ method: "GET" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => z.object({ assignmentId: IdSchema }).parse(input))
  .handler(async ({ data }): Promise<AssignmentSubmissionsData | null> => {
    return await AssignmentService.getAssignmentSubmissions(data.assignmentId);
  });

/**
 * Server Function: Send an assignment reminder to student inboxes (Protected: Faculty/Admin)
 */
export const sendAssignmentReminderFn = createServerFn({ method: "POST" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => SendReminderInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const user = sessionUser({ context });
    return await AssignmentService.sendReminder({
      ...data,
      teacherId: user.userId,
      teacherName: user.name,
    });
  });

/**
 * Server Function: Fetch individual student details (Protected: Faculty or Self)
 */
export const fetchStudentByIdFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data: id, context }): Promise<StudentRow | null> => {
    assertFacultyOrSelf(sessionUser({ context }), id, "You cannot access other students' records.");
    return await StudentService.getStudentById(id);
  });

/**
 * Server Function: Fetch student profile with homework stats & audio attempts (Protected: Faculty or Self)
 */
export const fetchStudentProfileFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data: id, context }) => {
    assertFacultyOrSelf(
      sessionUser({ context }),
      id,
      "You cannot access other students' profiles.",
    );
    return await StudentService.getStudentProfile(id);
  });

/**
 * Server Function: Fetch attempts for a specific student (Protected: Faculty or Self)
 */
export const fetchStudentAttemptsFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data: studentId, context }): Promise<AttemptResult[]> => {
    assertFacultyOrSelf(
      sessionUser({ context }),
      studentId,
      "You cannot view other students' practice attempts.",
    );
    return await AttemptService.getStudentAttempts(studentId);
  });

/**
 * Server Function: Save student practice attempt (Protected: Authenticated)
 */
export const saveAttemptFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => SaveAttemptInputSchema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ success: boolean; id: string; audioUrl?: string }> => {
      const user = sessionUser({ context });
      // Students can only save attempts for themselves.
      const studentId = user.role === "student" ? user.userId : data.studentId || user.userId;

      enforceRateLimit(studentId, {
        keyPrefix: "attempt",
        maxRequests: 30,
        windowMs: MINUTE,
        errorMessage:
          "Submission rate limit reached. Please wait a moment before submitting again.",
      });

      return await AttemptService.saveAttempt({
        studentId,
        moduleId: data.moduleId,
        assignmentId: data.assignmentId,
        result: { ...data.result, studentId },
      });
    },
  );

/**
 * Server Function: Fetch attempt diagnostic result (Protected: Faculty or Owner)
 */
export const fetchAttemptByIdFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data: attemptId, context }): Promise<AttemptResult> => {
    const user = sessionUser({ context });
    const attempt = await AttemptService.getAttemptById(attemptId);
    const isOwner = attempt.studentId === user.userId || attempt.studentId === user.email;
    // Same response as a missing attempt, so IDs cannot be probed.
    if (!isFaculty(user) && !isOwner) throw notFound("This recording could not be found.");
    return attempt;
  });

/**
 * Server Function: Update student speaking attempt transcript (Protected: Faculty or Owner)
 */
export const updateAttemptTranscriptFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => UpdateAttemptTranscriptInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AttemptResult> => {
    const user = sessionUser({ context });
    return await AttemptService.updateTranscript(
      data.attemptId,
      data.transcript,
      user.userId,
      isFaculty(user),
    );
  });

/**
 * Server Function: Save Teacher Feedback on student attempt (Protected: Faculty/Admin)
 */
export const saveTeacherFeedbackFn = createServerFn({ method: "POST" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        attemptId: IdSchema,
        feedback: z.string().min(1).max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const success = await AttemptService.saveTeacherFeedback(data.attemptId, data.feedback);
    return { success };
  });

/**
 * Server Function: Update student status (Protected: Faculty/Admin)
 */
export const updateStudentStatusFn = createServerFn({ method: "POST" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => UpdateStudentStatusInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const success = await StudentService.updateStatus(data.studentId, data.status);
    return { success };
  });

/**
 * Server Function: Send a direct message (Protected: Authenticated).
 * A student can only post to their own thread, and sender details always come from the server.
 */
export const sendDirectMessageFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => CreateMessageInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<DirectMessagePublic> => {
    const user = sessionUser({ context });

    enforceRateLimit(user.userId, {
      keyPrefix: "message",
      maxRequests: 30,
      windowMs: MINUTE,
      errorMessage: "You are sending messages too quickly. Please wait a moment.",
    });

    if (user.role === "student") {
      const teacher = data.teacherId ? await UserService.findFaculty(data.teacherId) : null;
      return await MessageService.sendMessage({
        studentId: user.userId,
        teacherId: teacher?.id ?? "faculty",
        teacherName: teacher?.name ?? "Faculty",
        content: data.content,
        senderRole: "student",
      });
    }

    return await MessageService.sendMessage({
      studentId: data.studentId,
      teacherId: user.userId,
      teacherName: user.name,
      content: data.content,
      senderRole: "teacher",
    });
  });

/**
 * Server Function: Fetch messages for a specific student (Protected: Faculty or Self)
 */
export const fetchStudentMessagesFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data: studentId, context }): Promise<DirectMessagePublic[]> => {
    assertFacultyOrSelf(
      sessionUser({ context }),
      studentId,
      "You cannot access other students' messages.",
    );
    return await MessageService.getMessagesForStudent(studentId);
  });

/**
 * Server Function: Mark message as read (Protected: Faculty or the message's student)
 */
export const markMessageReadFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => MarkMessageReadInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const user = sessionUser({ context });
    const success = await MessageService.markMessageRead(
      data.messageId,
      isFaculty(user) ? undefined : user.userId,
    );
    return { success };
  });

/**
 * Server Function: Transcribe an audio clip (Protected: Authenticated, rate limited).
 * Each call can use a paid speech API, so the limit also protects against runaway costs.
 */
export const streamTranscribeChunkFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => StreamTranscribeInputSchema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ text: string; confidence: number; isFinal: boolean }> => {
      enforceRateLimit(sessionUser({ context }).userId, {
        keyPrefix: "transcribe",
        maxRequests: 90,
        windowMs: MINUTE,
        errorMessage: "Too many transcription requests. Please wait a moment.",
      });

      const commaIdx = data.audioBase64.indexOf(",");
      const cleanBase64 = commaIdx >= 0 ? data.audioBase64.slice(commaIdx + 1) : data.audioBase64;
      return await TranscriptionService.transcribeChunk(
        Buffer.from(cleanBase64, "base64"),
        data.mimeType,
        data.promptContext,
        data.sequence,
        data.isFinal,
      );
    },
  );

/**
 * Server Function: Wake the FastWhisper sidecar, which sleeps on free hosting tiers (Protected: Authenticated)
 */
export const warmupWhisperFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .handler(async (): Promise<{ status: string }> => {
    TranscriptionService.pingWarmup();
    return { status: "ok" };
  });

/**
 * Server Function: Fetch real weekly student report (Protected: Faculty or Self)
 */
export const fetchStudentReportFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data: studentId, context }): Promise<StudentWeeklyReport | null> => {
    assertFacultyOrSelf(
      sessionUser({ context }),
      studentId,
      "You cannot access other students' reports.",
    );
    return await StudentService.getStudentWeeklyReport(studentId);
  });

/**
 * Server Function: Create student flag or request for teacher review (Protected: Authenticated)
 */
export const createFlagFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => CreateFlagInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<FlagItem> => {
    const user = sessionUser({ context });
    const isStudent = user.role === "student";

    enforceRateLimit(user.userId, {
      keyPrefix: "flag",
      maxRequests: 20,
      windowMs: MINUTE,
      errorMessage: "Please wait a moment before sending another request.",
    });

    return await FlagService.createFlag({
      ...data,
      // Students can only raise help requests about their own recordings.
      type: isStudent ? "student_request" : data.type,
      studentId: isStudent ? user.userId : data.studentId || user.userId,
      studentName: user.name,
      studentEmail: user.email,
    });
  });

/**
 * Server Function: Fetch flags for Teacher Console (Protected: Faculty/Admin)
 */
export const fetchFlagsFn = createServerFn({ method: "GET" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => FlagFilterSchema.parse(input))
  .handler(async ({ data }): Promise<FlagItem[]> => {
    return await FlagService.getFlags(data);
  });

/**
 * Server Function: Resolve a flag with teacher feedback (Protected: Faculty/Admin)
 */
export const resolveFlagFn = createServerFn({ method: "POST" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) => ResolveFlagInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const user = sessionUser({ context });
    const success = await FlagService.resolveFlag({
      ...data,
      teacherId: user.userId,
      teacherName: user.name,
    });
    return { success };
  });

/**
 * Server Function: Get global application settings (Protected: Authenticated).
 * Who last changed them is only shown to the master administrator.
 */
export const getAppSettingsFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }): Promise<AppSettings> => {
    const settings = await SettingsService.getSettings();
    if (sessionUser({ context }).isMasterAdmin) return settings;
    const { updatedBy: _hidden, ...visible } = settings;
    return visible;
  });

/**
 * Server Function: Update global application settings (Protected: Master Administrator only)
 */
export const updateAppSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminOnlyMiddleware])
  .validator((input: unknown) => UpdateAppSettingsInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AppSettings> => {
    const user = sessionUser({ context });
    if (!user.isMasterAdmin) {
      throw forbidden("System settings can only be changed by the master administrator.");
    }
    return await SettingsService.updateSettings(data, user.userId);
  });
