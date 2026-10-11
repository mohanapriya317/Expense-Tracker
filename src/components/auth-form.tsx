"use client";

import { Mic, Receipt, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, ApiClientError, hardNavigate } from "@/lib/api";
import { Button, Field, Input } from "./ui";

function nextUrl() {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState<false | "form" | "demo">(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setLoading("form");
    try {
      if (mode === "signup") {
        await api.post("/api/auth/signup", { name, email, password, tzOffset: -new Date().getTimezoneOffset(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        hardNavigate("/welcome");
      } else {
        await api.post("/api/auth/login", { email, password });
        hardNavigate(nextUrl());
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details) setErrors(err.details);
        setFormError(err.message);
      } else setFormError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const demo = async () => {
    setLoading("demo");
    setFormError(null);
    try {
      await api.post("/api/auth/demo", { tzOffset: -new Date().getTimezoneOffset() });
      hardNavigate("/");
    } catch (err) {
      setFormError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-fg lg:flex">
        <div className="flex items-center gap-2.5 text-lg font-bold">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15">₹</span> Expense Tracker
        </div>
        <div className="flex max-w-md flex-col gap-6">
          <h2 className="text-4xl font-bold leading-tight">Log an expense in under five seconds.</h2>
          <ul className="flex flex-col gap-4 text-lg opacity-90">
            <li className="flex items-center gap-3">
              <Sparkles className="size-5" /> Type “petrol 200” and we fill in the rest
            </li>
            <li className="flex items-center gap-3">
              <Mic className="size-5" /> Or just say it
            </li>
            <li className="flex items-center gap-3">
              <Receipt className="size-5" /> Or drop in a receipt screenshot
            </li>
          </ul>
        </div>
        <p className="text-sm opacity-70">Budgets, alerts, splits, reports and insights included.</p>
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-fg lg:hidden">₹</span>
            <h1 className="text-2xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="text-sm text-muted">{mode === "login" ? "Sign in to see your spending." : "It takes less than a minute."}</p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {mode === "signup" && (
              <Field label="Name" htmlFor="name" error={errors.name}>
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} required />
              </Field>
            )}
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} required />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password} hint={mode === "signup" ? "At least 8 characters." : undefined}>
              <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} required />
            </Field>
            {formError && !Object.keys(errors).length && (
              <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger" role="alert">
                {formError}
              </p>
            )}
            <Button type="submit" size="lg" loading={loading === "form"} disabled={!!loading}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" size="lg" onClick={demo} loading={loading === "demo"} disabled={!!loading}>
            Try the demo account
          </Button>

          <p className="text-center text-sm text-muted">
            {mode === "login" ? (
              <>
                New here?{" "}
                <Link href="/signup" className="font-semibold text-primary">
                  Create an account
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-primary">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
