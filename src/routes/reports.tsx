import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Send, Check, Printer, Loader2, Search, UserPlus, RotateCcw } from "lucide-react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { fetchStudentRosterFn, fetchStudentReportFn } from "@/server/data";
import { cachedClientFetch, invalidateClientDataCache } from "@/lib/client-cache";
import { TButton } from "@/components/tarang/Button";
import { StatusDot } from "@/components/tarang/StatusDot";
import { ParentReportCard } from "@/features/reports/components/ParentReportCard";
import { generateParentReportWhatsAppLink } from "@/features/reports/lib/whatsapp";
import type { StudentRow, StudentWeeklyReport } from "@/types";
import { useLanguage } from "@/lib/i18n";
import { useUser } from "@/lib/auth";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [{ title: "Parent Reports · Trounce" }],
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
    const studentRoster = await cachedClientFetch("student-roster", () => fetchStudentRosterFn());
    let initialReport: StudentWeeklyReport | null = null;
    if (studentRoster.length > 0) {
      initialReport = await cachedClientFetch("student-report-" + studentRoster[0].id, () =>
        fetchStudentReportFn({ data: studentRoster[0].id }),
      );
    }
    return { studentRoster, initialReport };
  },
  pendingComponent: ReportsSkeleton,
  component: ReportsPage,
});

function ReportsSkeleton() {
  return (
    <TeacherShell>
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-end pb-6 border-b border-hairline">
          <div>
            <div className="h-3 w-32 bg-ink-900 rounded mb-2" />
            <div className="h-8 w-64 bg-ink-900 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-96 bg-ink-900 rounded border border-hairline" />
          <div className="md:col-span-2 h-96 bg-ink-900 rounded border border-hairline" />
        </div>
      </div>
    </TeacherShell>
  );
}

function ReportsPage() {
  const { studentRoster, initialReport } = Route.useLoaderData();
  const { t } = useLanguage();
  const router = useRouter();
  const currentUser = useUser();

  const [selectedId, setSelectedId] = useState<string>(studentRoster[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [reportCache, setReportCache] = useState<Record<string, StudentWeeklyReport>>(
    initialReport && studentRoster[0] ? { [studentRoster[0].id]: initialReport } : {},
  );
  const [loadingReport, setLoadingReport] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync selectedId when studentRoster updates
  useEffect(() => {
    if (studentRoster.length > 0 && (!selectedId || !studentRoster.some((r) => r.id === selectedId))) {
      setSelectedId(studentRoster[0].id);
    }
  }, [studentRoster, selectedId]);

  const s: StudentRow = studentRoster.find((x) => x.id === selectedId) ??
    studentRoster[0] ?? {
      id: "empty",
      name: "Student",
      status: "on-track",
      focus: "General",
      lastActive: "Today",
      scorePct: 75,
      trendPct: 2,
      waveform: [],
    };

  const currentReport: StudentWeeklyReport | null =
    reportCache[selectedId] || (selectedId === studentRoster[0]?.id ? initialReport : null);

  useEffect(() => {
    if (!selectedId || selectedId === "empty") return;
    if (reportCache[selectedId]) return;

    let isMounted = true;
    setLoadingReport(true);
    fetchStudentReportFn({ data: selectedId })
      .then((rep) => {
        if (isMounted && rep) {
          setReportCache((prev) => ({ ...prev, [selectedId]: rep }));
        }
      })
      .catch((err) => {
        console.error("Failed to load student report:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingReport(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedId, reportCache]);

  const [reportLang, setReportLang] = useState<"hi" | "en">("hi");

  const handleRefreshRoster = async () => {
    setIsRefreshing(true);
    try {
      invalidateClientDataCache("student-roster");
      await router.invalidate();
    } finally {
      setIsRefreshing(false);
    }
  };

  const sendWhatsApp = () => {
    setSentIds((arr) => [...new Set([...arr, s.id])]);
    const url = generateParentReportWhatsAppLink(
      s,
      currentReport,
      reportLang,
      currentUser?.name,
      currentUser?.phone,
    );
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const printReport = () => {
    window.print();
  };

  const filteredRoster = studentRoster.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  return (
    <TeacherShell>
      {/* Page Header (Screen Only, completely hidden in Print) */}
      <div className="border-b border-hairline pb-6 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              parent reports & progress cards
            </p>
            <h1 className="display mt-1 text-[24px] sm:text-[28px]">This week's signal</h1>
            <p className="mt-1 text-[13px] text-secondary-warm">
              Pick a student to preview their weekly acoustic progress dossier. Send via WhatsApp or export as certified PDF.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshRoster}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-secondary-warm hover:text-primary-warm hover:bg-ink-800 transition cursor-pointer"
            >
              <RotateCcw size={13} className={isRefreshing ? "animate-spin text-[#3FB8AF]" : ""} />
              <span>Refresh</span>
            </button>
            <Link
              to="/users"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3FB8AF] px-3 py-1.5 text-[12px] font-semibold text-ink-950 hover:bg-[#3FB8AF]/90 transition cursor-pointer"
            >
              <UserPlus size={13} />
              <span>Manage Users</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Screen shows two columns (Roster + Preview), Print displays ONLY the card */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr] print:block print:mt-0">
        {/* Roster Column (Screen Only, hidden in Print) */}
        <div className="rounded-[8px] border border-hairline bg-ink-950/60 overflow-hidden flex flex-col print:hidden">
          {/* Roster Header & Search */}
          <div className="border-b border-hairline p-3 space-y-2.5 bg-ink-900/60">
            <div className="flex items-center justify-between">
              <span className="num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm font-semibold">
                roster · {studentRoster.length} students
              </span>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-tertiary-warm" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students..."
                className="w-full rounded-md border border-hairline bg-ink-950 pl-8 pr-3 py-1.5 text-[12px] text-primary-warm placeholder:text-tertiary-warm focus:outline-none focus:border-[#3FB8AF]"
              />
            </div>
          </div>

          {/* Student List */}
          {studentRoster.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-[13px] text-secondary-warm">No students enrolled yet.</p>
              <Link
                to="/users"
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-hairline bg-ink-900 px-3 py-1.5 text-[11px] font-medium text-[#3FB8AF] hover:bg-ink-800 transition"
              >
                <UserPlus size={12} />
                Enroll Students in /users
              </Link>
            </div>
          ) : filteredRoster.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-tertiary-warm">
              No students match "{searchQuery}"
            </div>
          ) : (
            <ul className="max-h-[280px] lg:max-h-[580px] overflow-y-auto divide-y divide-hairline/60">
              {filteredRoster.map((r) => {
                const active = r.id === selectedId;
                const sent = sentIds.includes(r.id);
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className={
                        "flex w-full items-center gap-3 px-3.5 py-3 text-left text-[13px] transition cursor-pointer " +
                        (active
                          ? "bg-ink-800 text-primary-warm border-l-2 border-[#3FB8AF]"
                          : "text-secondary-warm hover:bg-ink-900/80")
                      }
                    >
                      <StatusDot status={r.status} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-primary-warm">{r.name}</p>
                        <p className="text-[11px] text-tertiary-warm capitalize truncate">
                          {r.sessionSeason || "Summer"} · {r.batchTime || "Morning"}
                        </p>
                      </div>
                      {sent ? (
                        <span className="num inline-flex items-center gap-1 text-[11px] text-[#3FB8AF] shrink-0 font-medium">
                          <Check size={12} /> sent
                        </span>
                      ) : (
                        <span className="num text-[11px] text-tertiary-warm shrink-0 font-medium">
                          {r.scorePct}%
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Preview Pane & Actions */}
        <div>
          {/* Preview Subhead (Screen Only) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 print:hidden">
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm font-semibold">
              preview · what the parent sees
            </p>
            {loadingReport && (
              <span className="inline-flex items-center gap-1.5 num text-[11px] text-tertiary-warm">
                <Loader2 size={12} className="animate-spin text-[#3FB8AF]" />
                aggregating speech metrics...
              </span>
            )}
          </div>

          {/* The High-Fidelity Report Card */}
          <ParentReportCard
            student={s}
            report={currentReport}
            evaluatorName={currentUser?.name || "Faculty Mentor"}
          />

          {/* WhatsApp Language Selector (Screen Only, hidden in Print) */}
          <div className="mt-4 flex items-center justify-between rounded-[10px] border border-hairline bg-ink-900 px-4 py-2.5 w-full max-w-[460px] mx-auto text-[12px] print:hidden">
            <span className="text-secondary-warm font-medium">{t("whatsapp_lang_label")}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReportLang("hi")}
                className={`px-3 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  reportLang === "hi"
                    ? "bg-[#3FB8AF] text-ink-950 shadow-sm"
                    : "bg-ink-950 border border-hairline text-secondary-warm hover:text-primary-warm"
                }`}
              >
                Hindi
              </button>
              <button
                type="button"
                onClick={() => setReportLang("en")}
                className={`px-3 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  reportLang === "en"
                    ? "bg-[#3FB8AF] text-ink-950 shadow-sm"
                    : "bg-ink-950 border border-hairline text-secondary-warm hover:text-primary-warm"
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Print & WhatsApp Buttons (Screen Only, hidden in Print) */}
          <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-center gap-2.5 w-full max-w-[460px] mx-auto print:hidden">
            <TButton
              variant="secondary"
              surface="console"
              size="md"
              onClick={printReport}
              className="w-full sm:w-auto whitespace-nowrap cursor-pointer font-medium"
            >
              <Printer size={14} />
              Print / Save PDF
            </TButton>
            <TButton
              surface="console"
              size="md"
              onClick={sendWhatsApp}
              className="w-full sm:w-auto whitespace-nowrap cursor-pointer font-semibold"
            >
              <Send size={14} />
              {sentIds.includes(s.id) ? "Resend to WhatsApp" : t("share_on_whatsapp_btn")}
            </TButton>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
