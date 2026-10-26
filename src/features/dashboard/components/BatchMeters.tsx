import { useLanguage } from "@/lib/i18n";

export type StatusFilter = "all" | "on-track" | "nudge" | "flagged";

interface MeterProps {
  label: string;
  value: number;
  suffix?: string;
  tone?: "teal" | "amber" | "rust";
  active?: boolean;
  onClick?: () => void;
  hint?: string;
}

export function Meter({ label, value, suffix, tone, active, onClick, hint }: MeterProps) {
  const accent =
    tone === "teal"
      ? "text-[#3FB8AF] light:text-teal-700"
      : tone === "amber"
        ? "text-[#E2A33C] light:text-amber-700"
        : tone === "rust"
          ? "text-[#C1503B] light:text-red-700"
          : "text-primary-warm";

  const activeRing = active
    ? tone === "teal"
      ? "ring-2 ring-[#3FB8AF] border-[#3FB8AF] bg-[#3FB8AF]/[0.08] light:bg-teal-50"
      : tone === "amber"
        ? "ring-2 ring-[#E2A33C] border-[#E2A33C] bg-[#E2A33C]/[0.08] light:bg-amber-50"
        : tone === "rust"
          ? "ring-2 ring-[#C1503B] border-[#C1503B] bg-[#C1503B]/[0.08] light:bg-red-50"
          : "ring-2 ring-primary border-primary"
    : "border-hairline bg-ink-900";

  const hoverEffect = onClick
    ? "cursor-pointer transition-all hover:border-primary-warm/40 hover:scale-[1.01] active:scale-[0.99]"
    : "";

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative rounded-[8px] border px-4 py-3 shadow-sm select-none group ${activeRing} ${hoverEffect}`}
      title={hint || (onClick ? `Filter by ${label}` : undefined)}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm font-semibold truncate">
          {label}
        </p>
        {active && (
          <span className="num text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-ink-950/40 light:bg-slate-200/80 text-primary-warm">
            Active ✕
          </span>
        )}
        {!active && onClick && (
          <span className="num text-[9px] uppercase tracking-wider text-tertiary-warm opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
            Filter
          </span>
        )}
      </div>
      <p className={"num mt-2 text-[28px] font-semibold leading-none " + accent}>
        {value}
        {suffix && <span className="num text-[14px] font-normal text-tertiary-warm">{suffix}</span>}
      </p>
    </div>
  );
}

export function BatchMeters({
  onTrackCount,
  nudgeCount,
  flaggedCount,
  avgScore,
  activeFilter = "all",
  onFilterChange,
}: {
  onTrackCount: number;
  nudgeCount: number;
  flaggedCount: number;
  avgScore: number;
  activeFilter?: StatusFilter;
  onFilterChange?: (filter: StatusFilter) => void;
}) {
  const { t } = useLanguage();

  const handleToggle = (target: StatusFilter) => {
    if (!onFilterChange) return;
    onFilterChange(activeFilter === target ? "all" : target);
  };

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      <Meter
        label={t("status_on_track")}
        value={onTrackCount}
        tone="teal"
        active={activeFilter === "on-track"}
        onClick={onFilterChange ? () => handleToggle("on-track") : undefined}
        hint="Click to filter students on track"
      />
      <Meter
        label={t("status_needs_nudge")}
        value={nudgeCount}
        tone="amber"
        active={activeFilter === "nudge"}
        onClick={onFilterChange ? () => handleToggle("nudge") : undefined}
        hint="Click to filter students needing practice nudge"
      />
      <Meter
        label={t("status_flagged_help")}
        value={flaggedCount}
        tone="rust"
        active={activeFilter === "flagged"}
        onClick={onFilterChange ? () => handleToggle("flagged") : undefined}
        hint="Click to filter students needing teacher help"
      />
      <Meter
        label={t("meter_weekly_avg")}
        value={avgScore}
        suffix="%"
        hint="Average score across active students this week"
      />
    </div>
  );
}
