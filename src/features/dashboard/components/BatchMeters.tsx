interface MeterProps {
  label: string;
  value: number;
  suffix?: string;
  tone?: "teal" | "amber" | "rust";
}

export function Meter({ label, value, suffix, tone }: MeterProps) {
  const accent =
    tone === "teal"
      ? "text-[#3FB8AF]"
      : tone === "amber"
        ? "text-[#E2A33C]"
        : tone === "rust"
          ? "text-[#C1503B]"
          : "text-primary-warm";
  return (
    <div className="rounded-[4px] border border-hairline bg-ink-900 px-4 py-3">
      <p className="num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm">{label}</p>
      <p className={"num mt-2 text-[28px] leading-none " + accent}>
        {value}
        {suffix && <span className="num text-[14px] text-tertiary-warm">{suffix}</span>}
      </p>
    </div>
  );
}

export function BatchMeters({
  onTrackCount,
  nudgeCount,
  flaggedCount,
  avgScore,
}: {
  onTrackCount: number;
  nudgeCount: number;
  flaggedCount: number;
  avgScore: number;
}) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
      <Meter label="On track" value={onTrackCount} tone="teal" />
      <Meter label="Needs a nudge" value={nudgeCount} tone="amber" />
      <Meter label="Flagged" value={flaggedCount} tone="rust" />
      <Meter label="Avg score · week" value={avgScore} suffix="%" />
    </div>
  );
}
