import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { fetchStudentRosterFn } from "@/server/data";
import { cachedClientFetch } from "@/lib/client-cache";
import { BatchMeters, type StatusFilter } from "@/features/dashboard/components/BatchMeters";
import { FlaggedAlertPanel } from "@/features/dashboard/components/FlaggedAlertPanel";
import { ChannelStripTable } from "@/features/dashboard/components/ChannelStripTable";
import { Send, BookOpen, Search, X, RotateCcw } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Batch dashboard · Trounce" },
      {
        name: "description",
        content: "Batch overview as a channel-strip console: every student's signal at a glance.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
    if (
      context.session.role !== "teacher" &&
      context.session.role !== "admin" &&
      !context.session.isAdmin
    ) {
      throw redirect({ to: "/practice" });
    }
  },
  loader: async () => {
    return await cachedClientFetch("student-roster", () => fetchStudentRosterFn());
  },
  pendingComponent: DashboardSkeleton,
  component: Dashboard,
});

function DashboardSkeleton() {
  return (
    <TeacherShell>
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-end pb-6 border-b border-hairline">
          <div>
            <div className="h-3 w-32 bg-ink-900 rounded mb-2" />
            <div className="h-8 w-64 bg-ink-900 rounded" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-ink-900 rounded" />
            <div className="h-10 w-36 bg-ink-900 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="h-24 bg-ink-900 rounded border border-hairline" />
          <div className="h-24 bg-ink-900 rounded border border-hairline" />
          <div className="h-24 bg-ink-900 rounded border border-hairline" />
          <div className="h-24 bg-ink-900 rounded border border-hairline" />
        </div>
        <div className="h-64 bg-ink-900 rounded border border-hairline" />
      </div>
    </TeacherShell>
  );
}

function Dashboard() {
  const allStudents = Route.useLoaderData();

  const [selectedSession, setSelectedSession] = useState<string>("all");
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filter students by selected Session and Batch
  const cohortStudents = allStudents.filter((s) => {
    const matchesSession =
      selectedSession === "all" || (s.sessionSeason || "summer") === selectedSession;
    const matchesBatch = selectedBatch === "all" || (s.batchTime || "morning") === selectedBatch;
    return matchesSession && matchesBatch;
  });

  // Calculate stats for current session/batch cohort
  const cohortFlagged = cohortStudents.filter((s) => s.status === "flagged");
  const cohortNudge = cohortStudents.filter((s) => s.status === "nudge");
  const cohortOnTrack = cohortStudents.filter((s) => s.status === "on-track");
  const cohortActiveToday = cohortStudents.filter((s) => s.lastActive === "Today").length;

  const activeThisWeek = cohortStudents.filter((s) => {
    const la = s.lastActive;
    if (la === "Today" || la === "Yesterday") return true;
    const match = la.match(/^(\d+)d ago$/);
    return match ? parseInt(match[1], 10) <= 7 : false;
  });
  const avgScore =
    activeThisWeek.length > 0
      ? Math.round(activeThisWeek.reduce((a, s) => a + s.scorePct, 0) / activeThisWeek.length)
      : 0;

  // Filter by status and search query for display
  const query = searchQuery.trim().toLowerCase();
  const displayedStudents = cohortStudents.filter((s) => {
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    const matchesSearch =
      !query ||
      s.name.toLowerCase().includes(query) ||
      (s.focus && s.focus.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

  const handleResetFilters = () => {
    setSelectedSession("all");
    setSelectedBatch("all");
    setStatusFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters =
    selectedSession !== "all" ||
    selectedBatch !== "all" ||
    statusFilter !== "all" ||
    Boolean(query);

  const { t } = useLanguage();

  return (
    <TeacherShell>
      {/* Header strip */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm font-semibold">
            {t("batch_performance_title")}
          </p>
          <h1 className="display mt-1 text-[24px] sm:text-[28px]">
            {t("students_count", { count: cohortStudents.length })}
          </h1>
          <p className="num mt-1 text-[13px] text-secondary-warm">
            {t("dashboard_summary_status", {
              flagged: cohortFlagged.length,
              active: cohortActiveToday,
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Link
            to="/assignments"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-hairline bg-ink-900 px-3.5 sm:px-4 text-[13px] font-medium text-primary-warm transition hover:border-[#3FB8AF] shadow-xs whitespace-nowrap shrink-0"
          >
            <BookOpen size={14} className="text-[#3FB8AF] light:text-teal-700" />
            {t("give_homework_btn")}
          </Link>
          <Link
            to="/reports"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[#3FB8AF] px-3.5 sm:px-4 text-[13px] font-semibold text-[#100E0C] transition hover:brightness-110 shadow-xs whitespace-nowrap shrink-0"
          >
            <Send size={14} />
            {t("whatsapp_reports_btn")}
          </Link>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-[8px] border border-hairline bg-ink-900 p-3 sm:px-4 shadow-sm">
        {/* Left: Quick Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary-warm pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students by name or focus..."
            className="w-full h-9 pl-9 pr-8 text-[13px] bg-ink-950 light:bg-slate-50 border border-hairline rounded-[6px] text-primary-warm placeholder:text-tertiary-warm focus:outline-none focus:border-[#3FB8AF] focus:ring-1 focus:ring-[#3FB8AF] transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tertiary-warm hover:text-primary-warm p-0.5 rounded transition cursor-pointer"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Right: Cohort selectors & Reset */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Batch segmented pills */}
          <div className="flex items-center gap-1 bg-ink-950 light:bg-slate-100 p-1 rounded-[6px] border border-hairline">
            {[
              { id: "all", label: "All Batches" },
              { id: "morning", label: "Morning" },
              { id: "evening", label: "Evening" },
            ].map((bt) => (
              <button
                key={bt.id}
                onClick={() => setSelectedBatch(bt.id)}
                className={
                  "rounded-[4px] px-2.5 py-1 text-[12px] font-medium transition cursor-pointer " +
                  (selectedBatch === bt.id
                    ? "bg-[#E2A33C] text-[#100E0C] font-semibold shadow-xs"
                    : "text-secondary-warm hover:text-primary-warm")
                }
              >
                {bt.label}
              </button>
            ))}
          </div>

          {/* Session dropdown */}
          <div className="flex items-center">
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="h-9 px-3 text-[12px] font-medium bg-ink-950 light:bg-slate-100 border border-hairline rounded-[6px] text-primary-warm focus:outline-none focus:border-[#3FB8AF] cursor-pointer"
            >
              <option value="all">All Sessions</option>
              <option value="summer">Summer (Apr - Jun)</option>
              <option value="autumn">Autumn (Jul - Sep)</option>
              <option value="winter">Winter (Oct - Dec)</option>
              <option value="spring">Spring (Jan - Mar)</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-[12px] font-medium text-tertiary-warm hover:text-primary-warm bg-ink-800 light:bg-slate-200/70 border border-hairline rounded-[6px] transition cursor-pointer"
              title="Reset all filters and search"
            >
              <RotateCcw size={12} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Notice Strip */}
      {(statusFilter !== "all" || query) && (
        <div className="mt-3 flex items-center justify-between gap-2 px-3.5 py-2 rounded-[6px] bg-ink-800/80 light:bg-slate-100 border border-hairline text-[12px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-secondary-warm font-medium">Active filters:</span>
            {statusFilter !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ink-950 light:bg-white text-primary-warm border border-hairline font-semibold">
                Status:{" "}
                {statusFilter === "on-track"
                  ? "On Track"
                  : statusFilter === "nudge"
                    ? "Needs Nudge"
                    : "Needs Help"}
                <button
                  onClick={() => setStatusFilter("all")}
                  className="hover:text-[#C1503B] light:hover:text-red-700 ml-1 cursor-pointer"
                  title="Remove status filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {query && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ink-950 light:bg-white text-primary-warm border border-hairline font-semibold">
                Search: "{query}"
                <button
                  onClick={() => setSearchQuery("")}
                  className="hover:text-[#C1503B] light:hover:text-red-700 ml-1 cursor-pointer"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
          <button
            onClick={handleResetFilters}
            className="text-[#3FB8AF] light:text-teal-700 hover:underline font-semibold text-[11px] shrink-0 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Interactive Metric Meters */}
      <BatchMeters
        onTrackCount={cohortOnTrack.length}
        nudgeCount={cohortNudge.length}
        flaggedCount={cohortFlagged.length}
        avgScore={avgScore}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />

      {/* Student Activity Roster */}
      {cohortStudents.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="num text-[13px] uppercase tracking-[0.18em] text-tertiary-warm">
            No student activity yet
          </p>
          <p className="text-[14px] text-secondary-warm max-w-sm">
            Students will appear here once they record their first practice or homework submission.
          </p>
        </div>
      ) : statusFilter === "all" && !query ? (
        <>
          {/* Flagged Alert Panel for cohort */}
          <FlaggedAlertPanel flagged={cohortFlagged} totalCount={cohortStudents.length} />

          {/* Full Roster Channel Strips (non-flagged students maintaining recency) */}
          <ChannelStripTable
            students={cohortStudents.filter((s) => s.status !== "flagged")}
            onResetFilters={handleResetFilters}
          />
        </>
      ) : (
        /* Filtered or Searched Roster */
        <ChannelStripTable students={displayedStudents} onResetFilters={handleResetFilters} />
      )}
    </TeacherShell>
  );
}
