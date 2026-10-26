import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Surface = "deck" | "console";
type Size = "sm" | "md" | "lg";

interface TButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  surface?: Surface;
  size?: Size;
  children: ReactNode;
}

export const TButton = forwardRef<HTMLButtonElement, TButtonProps>(function TButton(
  { variant = "primary", surface = "deck", size = "md", className, children, ...rest },
  ref,
) {
  const radius = surface === "deck" ? "rounded-[12px]" : "rounded-[4px]";
  const sizing =
    size === "sm"
      ? "h-9 px-3 text-[14px]"
      : size === "lg"
        ? "h-14 px-6 text-[16px]"
        : "h-11 px-4 text-[14px]";

  const variants: Record<Variant, string> = {
    primary: "bg-[#3FB8AF] text-[#100E0C] hover:brightness-110 font-medium",
    secondary: "bg-transparent border border-hairline text-primary-warm hover:border-signal-teal hover:bg-ink-800",
    ghost: "bg-transparent text-secondary-warm hover:text-primary-warm hover:bg-ink-800",
    danger: "bg-transparent border border-[#C1503B]/70 text-[#C1503B] hover:bg-[#C1503B]/10",
  };

  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-[background-color,border-color,color,filter] duration-150 ease-out disabled:opacity-40 disabled:pointer-events-none select-none",
        radius,
        sizing,
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
