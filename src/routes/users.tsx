import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { TButton } from "@/components/tarang/Button";
import { fetchUsersFn, createUserFn, deleteUserFn } from "@/server/data";
import { cachedClientFetch, invalidateClientDataCache } from "@/lib/client-cache";
import type { UserPublic } from "@/server/services/user.service";
import { useUser } from "@/lib/auth";
import {
  UserPlus,
  Trash2,
  Search,
  Shield,
  GraduationCap,
  RotateCcw,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  AlertCircle,
  MessageSquare,
  Copy,
  Phone,
} from "lucide-react";
import {
  generateUserCredentialsWhatsAppUrl,
  formatCredentialsPlainText,
} from "@/features/users/lib/whatsapp-credentials";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "User & Teacher Management · Trounce" },
      {
        name: "description",
        content:
          "Administer teacher and student accounts, assign permanent credentials, and manage rosters.",
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
    const users = await cachedClientFetch("users", () => fetchUsersFn());
    return { users };
  },
  pendingComponent: UsersSkeleton,
  component: UsersManagementPage,
});

function UsersSkeleton() {
  return (
    <TeacherShell>
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-end pb-6 border-b border-hairline">
          <div>
            <div className="h-3 w-32 bg-ink-900 rounded mb-2" />
            <div className="h-8 w-64 bg-ink-900 rounded" />
          </div>
          <div className="h-10 w-36 bg-ink-900 rounded" />
        </div>
        <div className="h-14 bg-ink-900 rounded border border-hairline" />
        <div className="h-96 bg-ink-900 rounded border border-hairline" />
      </div>
    </TeacherShell>
  );
}

function UsersManagementPage() {
  const { users: initialUsers } = Route.useLoaderData();
  const currentUser = useUser();
  const router = useRouter();

  const [users, setUsers] = useState(initialUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "teacher" | "student">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State for New User Creation
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"teacher" | "student">("student");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newSession, setNewSession] = useState<"summer" | "autumn" | "winter" | "spring">("summer");
  const [newBatchTime, setNewBatchTime] = useState<"morning" | "evening">("morning");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdAccountData, setCreatedAccountData] = useState<{
    name: string;
    email: string;
    phone?: string;
    role: "teacher" | "student";
    passwordPlain: string;
    sessionSeason: string;
    batchTime: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const teacherCount = users.filter((u) => u.role === "teacher" || u.role === "admin").length;
  const studentCount = users.filter((u) => u.role === "student").length;

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pwd);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword) {
      setFormError("All fields (Name, Email, and Permanent Password) are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const created = (await createUserFn({
        data: {
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          phone: newPhone.trim() || undefined,
          role: newRole,
          passwordPlain: newPassword.trim(),
          sessionSeason: newSession,
          batchTime: newBatchTime,
          batchId: `${newSession}-${newBatchTime}`,
        },
      })) as UserPublic;

      setUsers([created, ...users]);

      // Save credentials for the WhatsApp dispatch modal
      setCreatedAccountData({
        name: created.name,
        email: created.email,
        phone: newPhone.trim() || undefined,
        role: newRole,
        passwordPlain: newPassword.trim(),
        sessionSeason: newSession,
        batchTime: newBatchTime,
      });

      setShowCreateModal(false);
      // Reset form
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewPassword("");
      invalidateClientDataCache("users");
      invalidateClientDataCache("student-roster");
      await router.invalidate();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to permanently delete user "${userName}"?`)) {
      return;
    }

    try {
      await deleteUserFn({ data: { userId } });
      setUsers(users.filter((u) => u.id !== userId));
      setSuccessMessage(`Deleted user ${userName}`);
      invalidateClientDataCache("users");
      invalidateClientDataCache("student-roster");
      await router.invalidate();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  return (
    <TeacherShell>
      <div className="space-y-6">
        {/* Header & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-6">
          <div>
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              User & Teacher Administration
            </p>
            <h1 className="display mt-1 text-[22px] sm:text-[26px]">Account & Batch Management</h1>
            <p className="mt-1 text-[13px] text-secondary-warm">
              Enroll students and teachers into 4-Season Sessions (Summer, Autumn, Winter, Spring)
              and assign batches.
            </p>
          </div>
          <TButton
            size="md"
            onClick={() => {
              setShowCreateModal(true);
              setFormError(null);
              setSuccessMessage(null);
            }}
            className="flex items-center justify-center gap-2 w-full sm:w-auto whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus size={16} />
            Create User / Teacher
          </TButton>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="flex items-center justify-between rounded-[8px] border border-[#3FB8AF]/40 bg-[#3FB8AF]/10 px-4 py-3 text-[13px] text-[#3FB8AF]">
            <span className="flex items-center gap-2">
              <Check size={16} />
              {successMessage}
            </span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-[12px] underline hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Metrics Overview Cards */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
            <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
              Total Accounts
            </p>
            <p className="display num mt-2 text-[28px] text-primary-warm">{users.length}</p>
            <p className="mt-1 text-[12px] text-secondary-warm">
              Across all 4 sessions & 8 batches
            </p>
          </div>

          <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                Faculty / Teachers
              </p>
              <Shield size={14} className="text-[#3FB8AF]" />
            </div>
            <p className="display num mt-2 text-[28px] text-primary-warm">{teacherCount}</p>
            <p className="mt-1 text-[12px] text-secondary-warm">Batch mentors & Administrators</p>
          </div>

          <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                Students
              </p>
              <GraduationCap size={14} className="text-[#E2A33C]" />
            </div>
            <p className="display num mt-2 text-[28px] text-primary-warm">{studentCount}</p>
            <p className="mt-1 text-[12px] text-secondary-warm">Enrolled active learners</p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-[12px] border border-hairline bg-ink-900 p-3 sm:p-4">
          <div className="flex flex-1 items-center gap-2 rounded-[8px] border border-hairline bg-ink-950 px-3 py-1.5 w-full sm:min-w-[240px]">
            <Search size={14} className="text-tertiary-warm shrink-0" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 rounded-[8px] border border-hairline bg-ink-950 p-1 shrink-0 justify-center">
            {(["all", "teacher", "student"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRoleFilter(tab)}
                className={
                  "rounded-[6px] px-3 py-1 text-[12px] capitalize transition cursor-pointer whitespace-nowrap " +
                  (roleFilter === tab
                    ? "bg-[#3FB8AF] text-[#100E0C] font-semibold"
                    : "text-secondary-warm hover:text-primary-warm")
                }
              >
                {tab === "all" ? "All Users" : `${tab}s`}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Users Cards View (< sm) */}
        <div className="sm:hidden space-y-3">
          {filteredUsers.length === 0 ? (
            <div className="rounded-[12px] border border-hairline bg-ink-900 p-6 text-center text-secondary-warm text-[13px]">
              No users found matching your search.
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isCurrent = u.id === currentUser?.userId || u.email === currentUser?.email;
              const isSuperAdmin = u.role === "admin";
              const sessionLabel = u.sessionSeason
                ? u.sessionSeason.charAt(0).toUpperCase() + u.sessionSeason.slice(1)
                : "Summer";
              const batchLabel = u.batchTime
                ? u.batchTime.charAt(0).toUpperCase() + u.batchTime.slice(1)
                : "Morning";

              return (
                <div
                  key={u.id}
                  className="rounded-[12px] border border-hairline bg-ink-900 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {u.role === "student" ? (
                        <Link
                          to="/students/$id"
                          params={{ id: u.id }}
                          className="font-medium text-primary-warm hover:text-[#3FB8AF] hover:underline flex items-center gap-1.5 truncate"
                        >
                          <span className="truncate">{u.name}</span>
                          <span className="num text-[10px] text-[#3FB8AF] shrink-0">→</span>
                        </Link>
                      ) : (
                        <div className="font-medium text-primary-warm truncate">{u.name}</div>
                      )}
                      <div className="text-[12px] text-tertiary-warm truncate mt-0.5">
                        {u.email}
                      </div>
                    </div>
                    <div>
                      {isSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 rounded bg-[#3FB8AF]/20 px-2 py-0.5 text-[11px] font-semibold text-[#3FB8AF] shrink-0">
                          <Shield size={11} />
                          ADMIN
                        </span>
                      ) : u.role === "teacher" ? (
                        <span className="inline-flex items-center gap-1 rounded bg-ink-800 px-2 py-0.5 text-[11px] font-medium text-primary-warm shrink-0">
                          Teacher
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-ink-800/60 px-2 py-0.5 text-[11px] text-secondary-warm shrink-0">
                          Student
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-hairline bg-ink-950 px-2 py-1 text-secondary-warm">
                      <span className="size-1.5 rounded-full bg-[#3FB8AF]" />
                      {sessionLabel} · {batchLabel}
                    </span>
                    <span className="num text-tertiary-warm">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Active"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-hairline pt-3">
                    {u.role === "student" ? (
                      <Link
                        to="/students/$id"
                        params={{ id: u.id }}
                        className="text-[12px] text-[#3FB8AF] hover:underline font-medium"
                      >
                        View Profile & Dossier →
                      </Link>
                    ) : (
                      <span className="text-[11px] text-tertiary-warm">Staff Account</span>
                    )}

                    {!isSuperAdmin && !isCurrent && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name)}
                        className="inline-flex items-center gap-1 rounded border border-alert-rust/30 px-2.5 py-1 text-[11px] text-alert-rust transition hover:bg-alert-rust/10 shrink-0 cursor-pointer"
                        title="Delete User"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    )}
                    {isSuperAdmin && (
                      <span className="text-[11px] text-tertiary-warm italic">Protected</span>
                    )}
                    {isCurrent && !isSuperAdmin && (
                      <span className="text-[11px] text-secondary-warm">(You)</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Users Table (Desktop & Tablet) */}
        <div className="hidden sm:block overflow-x-auto rounded-[12px] border border-hairline bg-ink-900">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead className="border-b border-hairline bg-ink-950/60 num text-[11px] uppercase tracking-wider text-tertiary-warm">
              <tr>
                <th className="px-5 py-3">User & Contact</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Session & Batch</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-secondary-warm">
                    No users found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser?.userId || u.email === currentUser?.email;
                  const isSuperAdmin = u.role === "admin";

                  const sessionLabel = u.sessionSeason
                    ? u.sessionSeason.charAt(0).toUpperCase() + u.sessionSeason.slice(1)
                    : "Summer";
                  const batchLabel = u.batchTime
                    ? u.batchTime.charAt(0).toUpperCase() + u.batchTime.slice(1)
                    : "Morning";

                  return (
                    <tr key={u.id} className="transition hover:bg-ink-800/40">
                      <td className="px-5 py-4">
                        {u.role === "student" ? (
                          <Link
                            to="/students/$id"
                            params={{ id: u.id }}
                            className="font-medium text-primary-warm hover:text-[#3FB8AF] hover:underline flex items-center gap-1.5"
                          >
                            {u.name}
                            <span className="num text-[10px] text-[#3FB8AF]">→</span>
                          </Link>
                        ) : (
                          <div className="font-medium text-primary-warm">{u.name}</div>
                        )}
                        <div className="text-[12px] text-tertiary-warm flex items-center gap-1.5 flex-wrap">
                          <span>{u.email}</span>
                          {u.phone && (
                            <span className="text-[#3FB8AF] light:text-teal-700 font-mono text-[11px] font-medium">
                              · 📱 +91 {u.phone.replace(/^91/, "")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {isSuperAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#3FB8AF]/20 px-2 py-0.5 text-[11px] font-semibold text-[#3FB8AF]">
                            <Shield size={11} />
                            ADMIN
                          </span>
                        ) : u.role === "teacher" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-ink-800 px-2 py-0.5 text-[11px] font-medium text-primary-warm">
                            Teacher
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-ink-800/60 px-2 py-0.5 text-[11px] text-secondary-warm">
                            Student
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-hairline bg-ink-950 px-2 py-1 text-[11px] text-secondary-warm">
                          <span className="size-1.5 rounded-full bg-[#3FB8AF]" />
                          {sessionLabel} · {batchLabel}
                        </span>
                      </td>
                      <td className="px-5 py-4 num text-[12px] text-tertiary-warm">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Active"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {u.phone && (
                          <a
                            href={`https://api.whatsapp.com/send?phone=${u.phone.startsWith("91") ? u.phone : "91" + u.phone}&text=${encodeURIComponent(
                              `Namaste ${u.name}! 🙏\nMessage from ${currentUser?.name || "Teacher"}${currentUser?.phone ? ` (${currentUser.phone})` : ""}, Trounce Spoken English Institute.`,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-emerald-400 light:text-emerald-700 hover:bg-emerald-500/10 mr-1.5 transition"
                            title={`Chat directly with ${u.name} on WhatsApp (+91 ${u.phone.replace(/^91/, "")})`}
                          >
                            <MessageSquare size={13} />
                          </a>
                        )}
                        {!isSuperAdmin && !isCurrent && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name)}
                            className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-[12px] text-alert-rust transition hover:bg-alert-rust/10"
                            title="Delete User"
                          >
                            <Trash2 size={13} />
                            Delete
                          </button>
                        )}
                        {isSuperAdmin && (
                          <span className="text-[11px] text-tertiary-warm italic">Protected</span>
                        )}
                        {isCurrent && !isSuperAdmin && (
                          <span className="text-[11px] text-secondary-warm">(You)</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal: Create User / Teacher */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-[480px] rounded-[16px] border border-hairline bg-ink-950 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-hairline pb-4">
                <div>
                  <h2 className="display text-[18px]">Create New Account</h2>
                  <p className="text-[12px] text-secondary-warm">
                    Assign permanent credentials and batch session
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-tertiary-warm hover:text-primary-warm text-[14px]"
                >
                  ✕
                </button>
              </div>

              {formError && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-alert-rust bg-alert-rust/10 p-3 text-[12px] text-alert-rust">
                  <AlertCircle size={14} />
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
                {/* Role Switcher */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                    Account Role
                  </label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewRole("student")}
                      className={
                        "h-10 rounded-[8px] border text-[13px] font-medium transition " +
                        (newRole === "student"
                          ? "border-[#3FB8AF] bg-[#3FB8AF]/15 text-[#3FB8AF]"
                          : "border-hairline text-secondary-warm hover:border-[#9C9388]")
                      }
                    >
                      Student
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRole("teacher")}
                      className={
                        "h-10 rounded-[8px] border text-[13px] font-medium transition " +
                        (newRole === "teacher"
                          ? "border-[#3FB8AF] bg-[#3FB8AF]/15 text-[#3FB8AF]"
                          : "border-hairline text-secondary-warm hover:border-[#9C9388]")
                      }
                    >
                      Teacher / Mentor
                    </button>
                  </div>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Chandra"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. ramesh@trounce.in"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
                  />
                </div>

                {/* Phone Number (WhatsApp) */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                    WhatsApp Phone Number
                  </label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-2.5 text-[13px] text-tertiary-warm font-mono">
                      +91
                    </span>
                    <input
                      type="tel"
                      placeholder="98765 43210"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value.replace(/[^0-9]/g, ""))}
                      maxLength={10}
                      className="h-10 w-full rounded-[8px] border border-hairline bg-ink-900 pl-11 pr-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none font-mono"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-secondary-warm">
                    Login credentials will be sent to this WhatsApp number on creation.
                  </p>
                </div>

                {/* Permanent Password */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                      Permanent Password
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="flex items-center gap-1 text-[11px] text-[#3FB8AF] hover:underline"
                    >
                      <RotateCcw size={11} />
                      Generate
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Assign user password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 pr-10 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-tertiary-warm hover:text-secondary-warm"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Session (Season) & Batch (Timing) Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                      Session (3-Month Season)
                    </label>
                    <select
                      value={newSession}
                      onChange={(e) =>
                        setNewSession(e.target.value as "summer" | "autumn" | "winter" | "spring")
                      }
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
                    >
                      <option value="summer">Summer (Apr - Jun)</option>
                      <option value="autumn">Autumn (Jul - Sep)</option>
                      <option value="winter">Winter (Oct - Dec)</option>
                      <option value="spring">Spring (Jan - Mar)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                      Batch Timing
                    </label>
                    <select
                      value={newBatchTime}
                      onChange={(e) => setNewBatchTime(e.target.value as "morning" | "evening")}
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
                    >
                      <option value="morning">Morning Batch</option>
                      <option value="evening">Evening Batch</option>
                    </select>
                  </div>
                </div>

                {/* Submit / Cancel Buttons */}
                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="h-10 w-full sm:w-auto rounded-[8px] px-4 text-[13px] text-secondary-warm hover:text-primary-warm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <TButton
                    type="submit"
                    size="md"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto whitespace-nowrap cursor-pointer"
                  >
                    {isSubmitting ? "Creating..." : "Save & Create User"}
                  </TButton>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: WhatsApp Credentials Dispatch */}
        {createdAccountData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-[500px] rounded-[16px] border border-hairline bg-ink-950 light:bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-hairline pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-full bg-emerald-500/15 light:bg-emerald-100 text-emerald-400 light:text-emerald-700 flex items-center justify-center font-bold">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h2 className="display text-[18px] text-primary-warm">Account Created!</h2>
                    <p className="text-[12px] text-secondary-warm">
                      Dispatch login credentials directly via WhatsApp
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCreatedAccountData(null)}
                  className="rounded-[6px] p-1 text-tertiary-warm hover:text-primary-warm text-[14px] cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Credentials Summary Box */}
              <div className="mt-4 rounded-[10px] border border-hairline bg-ink-900 light:bg-slate-50 p-4 space-y-2.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-secondary-warm">Name:</span>
                  <span className="font-semibold text-primary-warm">{createdAccountData.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary-warm">Role:</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-ink-950 light:bg-slate-200 text-primary-warm">
                    {createdAccountData.role}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary-warm">Email / User ID:</span>
                  <span className="font-mono text-primary-warm">{createdAccountData.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary-warm">Permanent Password:</span>
                  <span className="font-mono font-bold text-[#3FB8AF] light:text-teal-700 bg-ink-950 light:bg-white px-2 py-0.5 rounded border border-hairline">
                    {createdAccountData.passwordPlain}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary-warm">WhatsApp Number:</span>
                  <span className="font-mono text-primary-warm">
                    {createdAccountData.phone ? `+91 ${createdAccountData.phone}` : "Not provided"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary-warm">Batch:</span>
                  <span className="text-primary-warm">
                    {createdAccountData.sessionSeason.toUpperCase()} ·{" "}
                    {createdAccountData.batchTime.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 space-y-2.5">
                <a
                  href={generateUserCredentialsWhatsAppUrl({
                    ...createdAccountData,
                    senderName: currentUser?.name,
                    senderPhone: currentUser?.phone,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 h-11 w-full rounded-[8px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[13px] transition shadow-md cursor-pointer"
                >
                  <MessageSquare size={16} />
                  <span>Send Credentials on WhatsApp</span>
                </a>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(formatCredentialsPlainText(createdAccountData));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 3000);
                    }}
                    className="flex items-center justify-center gap-1.5 h-9 rounded-[8px] border border-hairline bg-ink-900 light:bg-slate-100 hover:bg-ink-800 text-[12px] font-medium text-primary-warm transition cursor-pointer"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copied ? "Copied!" : "Copy Details"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreatedAccountData(null)}
                    className="flex items-center justify-center h-9 rounded-[8px] border border-hairline bg-ink-900 light:bg-slate-100 hover:bg-ink-800 text-[12px] text-secondary-warm hover:text-primary-warm transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
