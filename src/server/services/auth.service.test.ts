import { describe, it, expect } from "vitest";
import { AuthService } from "./auth.service";
import type { UserDoc } from "../db/schemas";

describe("AuthService Unit Tests", () => {
  const mockTeacherUser: UserDoc = {
    id: "teacher-test-1",
    email: "teacher.test@tarang.in",
    username: "teacher_test",
    name: "Test Teacher",
    role: "teacher",
    sessionSeason: "summer",
    batchTime: "morning",
    batchId: "summer-morning",
    passwordHash: "mock_hash",
    createdAt: new Date(),
  };

  const mockStudentUser: UserDoc = {
    id: "student-test-1",
    email: "student.test@tarang.in",
    username: "student_test",
    name: "Test Student",
    role: "student",
    sessionSeason: "summer",
    batchTime: "morning",
    batchId: "summer-morning",
    passwordHash: "mock_hash",
    createdAt: new Date(),
  };

  it("should generate a valid signed JWT session token for teacher", async () => {
    const token = await AuthService.createSessionToken(mockTeacherUser);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const payload = await AuthService.verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(mockTeacherUser.id);
    expect(payload?.email).toBe(mockTeacherUser.email);
    expect(payload?.role).toBe("teacher");
    expect(payload?.isAdmin).toBe(false);
  });

  it("should generate a valid signed JWT session token for student", async () => {
    const token = await AuthService.createSessionToken(mockStudentUser);
    const payload = await AuthService.verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(mockStudentUser.id);
    expect(payload?.role).toBe("student");
  });

  it("should return null for tampered or invalid JWT token", async () => {
    const validToken = await AuthService.createSessionToken(mockStudentUser);
    const tamperedToken = validToken.slice(0, -5) + "abcde";
    const payload = await AuthService.verifySessionToken(tamperedToken);
    expect(payload).toBeNull();
  });

  it("should return null for empty string or malformed token", async () => {
    const payload = await AuthService.verifySessionToken("invalid.token.here");
    expect(payload).toBeNull();
  });
});
