export interface DirectMessagePublic {
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  content: string;
  read: boolean;
  senderRole?: "teacher" | "student";
  createdAt: string;
}

export interface CreateMessageInput {
  studentId: string;
  teacherId: string;
  teacherName: string;
  content: string;
  senderRole?: "teacher" | "student";
}
