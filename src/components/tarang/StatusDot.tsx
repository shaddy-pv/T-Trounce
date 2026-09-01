import { cn } from "@/lib/utils";

export type Status = "on-track" | "nudge" | "flagged";

const map: Record<Status, { color: string; label: string }> = {
  "on-track": { color: "bg-[#3FB8AF]", label: "On track" },
  nudge: { color: "bg-[#E2A33C]", label: "Needs a nudge" },
  flagged: { color: "bg-[#C1503B]", label: "Flagged" },
};

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  const m = map[status];
  return (
    <span
      aria-label={m.label}
      title={m.label}
      className={cn("inline-block size-2 rounded-full", m.color, className)}
    />
  );
}
