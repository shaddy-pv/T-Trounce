import { useState, useEffect } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { TButton } from "@/components/tarang/Button";
import { sendDirectMessageFn, fetchStudentMessagesFn } from "@/server/data";
import { useUser } from "@/lib/auth";

import type { DirectMessagePublic } from "@/types";

interface DirectNoteModalProps {
  studentId: string;
  studentName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DirectNoteModal({ studentId, studentName, isOpen, onClose }: DirectNoteModalProps) {
  const user = useUser();
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [msgs, setMsgs] = useState<DirectMessagePublic[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchStudentMessagesFn({ data: studentId }).then(setMsgs).catch(console.error);
    }
  }, [isOpen, studentId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !user) return;

    setIsSending(true);
    try {
      const newMsg = await sendDirectMessageFn({
        data: {
          studentId,
          teacherId: user.userId,
          teacherName: user.name,
          content: messageText.trim(),
          senderRole: "teacher",
        },
      });
      setMsgs([newMsg, ...msgs]);
      setMessageText("");
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-[4px] border border-hairline bg-ink-900 p-6">
        <h3 className="display text-[18px] text-primary-warm">Message {studentName}</h3>
        <p className="mt-1 text-[13px] text-secondary-warm">
          Leave teacher guidance or prompt suggestions for their next practice session.
        </p>

        {msgs.length > 0 && (
          <div className="mt-4 flex max-h-[300px] flex-col-reverse gap-3 overflow-y-auto rounded-[8px] border border-hairline bg-ink-950 p-3">
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`rounded-[8px] p-3 text-[13px] ${
                  m.senderRole === "student"
                    ? "bg-ink-900 border border-hairline mr-8"
                    : "bg-[#3FB8AF]/10 border border-[#3FB8AF]/30 text-primary-warm ml-8"
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold">
                    {m.senderRole === "student" ? studentName : "You"}
                  </span>
                  <span className="text-[10px] text-tertiary-warm opacity-70">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 rounded-[4px] border border-hairline bg-ink-950 p-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
          />
          <TButton
            surface="console"
            size="sm"
            type="submit"
            disabled={isSending || !messageText.trim()}
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </TButton>
        </form>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="text-[12px] text-secondary-warm hover:text-primary-warm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
