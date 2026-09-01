import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login", replace: true });
    }
    if (
      context.session.role === "teacher" ||
      context.session.role === "admin" ||
      context.session.isAdmin
    ) {
      throw redirect({ to: "/dashboard", replace: true });
    }
    throw redirect({ to: "/practice", replace: true });
  },
  component: () => <div className="min-h-screen bg-ink-950" />,
});
