import { describe, it, expect } from "vitest";
import { LoginInputSchema } from "./auth.validator";
import { CreateUserInputSchema, DeleteUserInputSchema } from "./user.validator";
import { CreateAssignmentInputSchema } from "./assignment.validator";
import { UpdateStudentStatusInputSchema } from "./student.validator";
import { CreateMessageInputSchema } from "./message.validator";
import { UpdateAttemptTranscriptInputSchema } from "./attempt.validator";

describe("Zod Validator Schemas Unit Tests", () => {
  describe("LoginInputSchema", () => {
    it("should accept valid student credentials", () => {
      const valid = LoginInputSchema.safeParse({
        email: "student@tarang.in",
        passwordPlain: "password123",
        role: "student",
      });
      expect(valid.success).toBe(true);
    });

    it("should reject invalid email format", () => {
      const invalid = LoginInputSchema.safeParse({
        email: "not-an-email",
        passwordPlain: "password123",
        role: "student",
      });
      expect(invalid.success).toBe(false);
    });

    it("should reject empty password", () => {
      const invalid = LoginInputSchema.safeParse({
        email: "teacher@tarang.in",
        passwordPlain: "",
        role: "teacher",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("CreateUserInputSchema", () => {
    it("should validate a complete user creation payload", () => {
      const valid = CreateUserInputSchema.safeParse({
        name: "Aman Verma",
        email: "aman@tarang.in",
        role: "student",
        passwordPlain: "secret123",
        sessionSeason: "summer",
        batchTime: "morning",
      });
      expect(valid.success).toBe(true);
    });

    it("should reject passwords shorter than 6 characters", () => {
      const invalid = CreateUserInputSchema.safeParse({
        name: "Aman",
        email: "aman@tarang.in",
        role: "student",
        passwordPlain: "123",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("CreateAssignmentInputSchema", () => {
    it("should validate assignment parameters", () => {
      const valid = CreateAssignmentInputSchema.safeParse({
        title: "Introduction Practice",
        instructions: "Speak clearly",
        prompt: "Introduce yourself in 30 seconds.",
        difficulty: "Beginner",
        durationSec: 45,
        targetSession: "summer",
        targetBatch: "morning",
      });
      expect(valid.success).toBe(true);
    });

    it("should reject duration less than 10 seconds", () => {
      const invalid = CreateAssignmentInputSchema.safeParse({
        title: "Introduction",
        instructions: "",
        prompt: "Test prompt here",
        difficulty: "Beginner",
        durationSec: 5,
        targetSession: "summer",
        targetBatch: "morning",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("UpdateStudentStatusInputSchema", () => {
    it("should allow valid statuses", () => {
      expect(
        UpdateStudentStatusInputSchema.safeParse({ studentId: "s-1", status: "on-track" }).success,
      ).toBe(true);
      expect(
        UpdateStudentStatusInputSchema.safeParse({ studentId: "s-1", status: "nudge" }).success,
      ).toBe(true);
      expect(
        UpdateStudentStatusInputSchema.safeParse({ studentId: "s-1", status: "flagged" }).success,
      ).toBe(true);
    });

    it("should reject invalid status strings", () => {
      expect(
        UpdateStudentStatusInputSchema.safeParse({ studentId: "s-1", status: "unknown" }).success,
      ).toBe(false);
    });
  });

  describe("CreateMessageInputSchema", () => {
    it("should accept valid student messages", () => {
      const valid = CreateMessageInputSchema.safeParse({
        studentId: "s-1",
        content: "Hello Sir, I have a doubt regarding rhythm.",
      });
      expect(valid.success).toBe(true);
    });

    it("should reject empty message content", () => {
      const invalid = CreateMessageInputSchema.safeParse({
        studentId: "s-1",
        content: "",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("UpdateAttemptTranscriptInputSchema", () => {
    it("should accept valid attemptId and corrected transcript", () => {
      const valid = UpdateAttemptTranscriptInputSchema.safeParse({
        attemptId: "attempt-123",
        transcript: "Hello, my name is Shadan and I am practicing pronunciation.",
      });
      expect(valid.success).toBe(true);
    });

    it("should reject empty transcript", () => {
      const invalid = UpdateAttemptTranscriptInputSchema.safeParse({
        attemptId: "attempt-123",
        transcript: "",
      });
      expect(invalid.success).toBe(false);
    });
  });
});
