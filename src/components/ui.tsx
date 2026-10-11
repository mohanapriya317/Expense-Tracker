"use client";

import { clsx } from "clsx";
import { LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";

export const cn = clsx;

/* ---------- Button ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover shadow-sm",
  secondary: "border border-line bg-surface text-fg hover:bg-surface-muted",
  ghost: "text-fg hover:bg-surface-muted",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
  soft: "bg-primary-soft text-primary-ink hover:brightness-95",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex select-none items-center justify-center rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    extra,
  );
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", size = "md", className, children, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...rest }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-flex size-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-muted disabled:opacity-50", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Form fields ---------- */

export function Field({ label, error, hint, children, htmlFor, className }: { label: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const fieldBase =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input"> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(fieldBase, "h-11", invalid && "border-danger", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-20 py-2.5", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(fieldBase, "h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a93a3' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-[15px] font-medium">
          {label}
        </label>
        {description && <span className="text-[13px] text-muted">{description}</span>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary" : "bg-line")}
      >
        <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-surface-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-9 rounded-lg px-3 text-sm font-medium transition-colors", value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Surfaces ---------- */

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "primary" | "success" | "warning" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface-muted text-muted",
    primary: "bg-primary-soft text-primary-ink",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning-ink",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Progress({ value, tone = "primary", marker, label }: { value: number; tone?: "primary" | "warning" | "danger" | "success"; marker?: number; label?: string }) {
  const tones = { primary: "bg-primary", warning: "bg-warning", danger: "bg-danger", success: "bg-success" };
  return (
    <div className="relative h-2 rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-2 rounded-full transition-all", tones[tone])} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      {marker != null && <div className="absolute -top-1 h-4 w-0.5 rounded bg-fg/70" style={{ left: `${Math.min(marker, 100)}%` }} title="Where you should be today" />}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-muted", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-5 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-10 text-center">
      <p className="text-sm text-muted">{message ?? "Couldn't load this. Check your connection and try again."}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ---------- Dialog / sheet ----------
   A native <dialog>: focus trap, Escape and the backdrop come from the browser.
   Bottom sheet on phones, centred modal from 640px up. */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  hideTitle,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  hideTitle?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the first button (Close). Prefer a field marked data-autofocus, else the dialog itself.
      (d.querySelector<HTMLElement>("[data-autofocus]") ?? d).focus();
    }
    if (!open && d.open) d.close();
    return () => {
      if (d.open) d.close();
    };
  }, [open]);

  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-surface p-0 text-fg shadow-2xl outline-none backdrop:bg-overlay",
        "sm:m-auto sm:max-h-[86dvh] sm:rounded-2xl",
        widths[size],
        open && "animate-sheet-in",
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col sm:max-h-[86dvh]">
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
          <div className={cn("flex shrink-0 items-center justify-between gap-2 px-5 pt-3 sm:pt-5", hideTitle && "sr-only")}>
            <h2 id={titleId} className="text-xl font-bold">
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose} className="-mr-2 text-muted">
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">{children}</div>
          {footer && <div className="shrink-0 border-t border-line bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  loading,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body && <div className="text-[15px] text-muted">{body}</div>}
    </Sheet>
  );
}

/** Coloured dot showing how sure the parser was about a field. */
export function ConfidenceDot({ level }: { level?: "high" | "low" | "none" | null }) {
  if (!level || level === "none") return null;
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", level === "high" ? "bg-success" : "bg-warning")}
      title={level === "high" ? "AI is confident" : "Please check this"}
      aria-label={level === "high" ? "AI is confident" : "Please check this"}
    />
  );
}
