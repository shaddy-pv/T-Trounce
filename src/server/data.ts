import { createServerFn } from "@tanstack/react-start";
import { setCookie, deleteCookie } from "@tanstack/react-start/server";
import {
  authenticatedMiddleware,
  teacherOnlyMiddleware,
  adminOnlyMiddleware,
  COOKIE_NAME,
} from "./middleware/auth.middleware";
import { ModuleService } from "./services/module.service";
import { StudentService } from "./services/student.service";
import { AttemptService } from "./services/attempt.service";
import { AuthService, type SessionPayload } from "./services/auth.service";
import { UserService, type UserPublic } from "./services/user.service";
import { AssignmentService, type AssignmentPublic } from "./services/assignment.service";
import { MessageService } from "./services/message.service";
import { TranscriptionService } from "./services/transcription.service";

import { LoginInputSchema } from "./validators/auth.validator";
import { CreateUserInputSchema, DeleteUserInputSchema } from "./validators/user.validator";
import {
  CreateAssignmentInputSchema,
  DeleteAssignmentInputSchema,
  AssignmentFilterSchema,
} from "./validators/assignment.validator";
import { SaveAttemptInputSchema } from "./validators/attempt.validator";
import {
  UpdateStudentStatusInputSchema,
  StudentRosterFilterSchema,
} from "./validators/student.validator";
import {
  CreateMessageInputSchema,
  MarkMessageReadInputSchema,
} from "./validators/message.validator";
import { z } from "zod";
import type { Module, StudentRow, AttemptResult, DirectMessagePublic } from "@/types";

/**
 * Server Function: Authenticate user and issue secure HTTP-only session cookie
 */
export const loginFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => LoginInputSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await AuthService.authenticateUserWithRole(
      data.email,
      data.passwordPlain,
      data.role,
    );
    if (!user) {
      throw new Error("Invalid email or password");
    }

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
  deleteCookie(COOKIE_NAME);
  return { success: true };
});

/**
 * Server Function: Get Current Session
 */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionPayload | null> => {
    const { getCookie } = await import("@tanstack/react-start/server");
    const token = getCookie(COOKIE_NAME);
    if (!token) return null;
    return await AuthService.verifySessionToken(token);
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
  .validator((input: unknown) => z.string().min(1).parse(input))
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
    const user = (context as { user: SessionPayload }).user;
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
  .validator((input: unknown) => z.string().min(1).parse(input))
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
 * Server Function: Fetch individual student details (Protected: Faculty or Self)
 */
export const fetchStudentByIdFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => z.string().min(1).parse(input))
  .handler(async ({ data: id, context }): Promise<StudentRow | null> => {
    const user = (context as { user: SessionPayload }).user;
    const isFaculty = user.role === "teacher" || user.role === "admin" || user.isAdmin;
    if (!isFaculty && user.userId !== id) {
      throw new Error("Forbidden: You cannot access other students' records.");
    }
    return await StudentService.getStudentById(id);
  });

/**
 * Server Function: Fetch student profile with homework stats & audio attempts (Protected: Faculty or Self)
 */
export const fetchStudentProfileFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => z.string().min(1).parse(input))
  .handler(async ({ data: id, context }) => {
    const user = (context as { user: SessionPayload }).user;
    const isFaculty = user.role === "teacher" || user.role === "admin" || user.isAdmin;
    if (!isFaculty && user.userId !== id) {
      throw new Error("Forbidden: You cannot access other students' profiles.");
    }
    return await StudentService.getStudentProfile(id);
  });

/**
 * Server Function: Fetch attempts for a specific student (Protected: Faculty or Self)
 */
export const fetchStudentAttemptsFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => z.string().min(1).parse(input))
  .handler(async ({ data: studentId, context }): Promise<AttemptResult[]> => {
    const user = (context as { user: SessionPayload }).user;
    const isFaculty = user.role === "teacher" || user.role === "admin" || user.isAdmin;
    if (!isFaculty && user.userId !== studentId) {
      throw new Error("Forbidden: You cannot view other students' practice attempts.");
    }
    return await AttemptService.getStudentAttempts(studentId);
  });

/**
 * Server Function: Save student practice attempt (Protected: Authenticated)
 */
export const saveAttemptFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => SaveAttemptInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ success: boolean; id: string }> => {
    const user = (context as { user: SessionPayload }).user;
    // Enforce student's own ID
    const studentId = user.role === "student" ? user.userId : data.studentId || user.userId;

    return await AttemptService.saveAttempt({
      studentId,
      moduleId: data.moduleId,
      assignmentId: data.assignmentId,
      result: {
        ...data.result,
        studentId,
      },
    });
  });

/**
 * Server Function: Fetch attempt diagnostic result (Protected: Authenticated)
 */
export const fetchAttemptByIdFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => z.string().min(1).parse(input))
  .handler(async ({ data: attemptId }): Promise<AttemptResult> => {
    return await AttemptService.getAttemptById(attemptId);
  });

/**
 * Server Function: Save Teacher Feedback on student attempt (Protected: Faculty/Admin)
 */
export const saveTeacherFeedbackFn = createServerFn({ method: "POST" })
  .middleware([teacherOnlyMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        attemptId: z.string().min(1),
        feedback: z.string().min(1),
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
 * Server Function: Send a direct message to a student (Protected: Authenticated)
 */
export const sendDirectMessageFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => CreateMessageInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<DirectMessagePublic> => {
    const user = (context as { user: SessionPayload }).user;
    return await MessageService.sendMessage({
      ...data,
      teacherId:
        user.role === "teacher" || user.role === "admin"
          ? user.userId
          : data.teacherId || "teacher-1",
      teacherName:
        user.role === "teacher" || user.role === "admin"
          ? user.name
          : data.teacherName || "Faculty",
      senderRole: user.role === "student" ? "student" : "teacher",
    });
  });

/**
 * Server Function: Fetch messages for a specific student (Protected: Faculty or Self)
 */
export const fetchStudentMessagesFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => z.string().min(1).parse(input))
  .handler(async ({ data: studentId, context }): Promise<DirectMessagePublic[]> => {
    const user = (context as { user: SessionPayload }).user;
    const isFaculty = user.role === "teacher" || user.role === "admin" || user.isAdmin;
    if (!isFaculty && user.userId !== studentId) {
      throw new Error("Forbidden: You cannot access other students' messages.");
    }
    return await MessageService.getMessagesForStudent(studentId);
  });

/**
 * Server Function: Mark message as read (Protected: Authenticated)
 */
export const markMessageReadFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => MarkMessageReadInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const success = await MessageService.markMessageRead(data.messageId);
    return { success };
  });

/**
 * Server Function: Stream-transcribe a real-time audio chunk from live microphone stream
 */
export const streamTranscribeChunkFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .validator((input: unknown) => {
    return z
      .object({
        audioBase64: z.string(),
        mimeType: z.string().default("audio/wav"),
        promptContext: z.string().optional(),
        sequence: z.number().default(0),
        isFinal: z.boolean().default(false),
      })
      .parse(input);
  })
  .handler(async ({ data }): Promise<{ text: string; confidence: number; isFinal: boolean }> => {
    const cleanBase64 = data.audioBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    return await TranscriptionService.transcribeChunk(
      buffer,
      data.mimeType,
      data.promptContext,
      data.sequence,
    );
  });


