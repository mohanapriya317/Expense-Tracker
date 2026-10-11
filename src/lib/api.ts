"use client";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

// Set once a full-page navigation has started, so a late 401 can't redirect somewhere else.
let navigating = false;

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth") && !navigating) {
    const next = window.location.pathname + window.location.search;
    hardNavigate(`/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
    throw new ApiClientError(401, "Please sign in.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiClientError(res.status, data.error ?? "Something went wrong.", data.details);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
  upload: <T>(url: string, form: FormData) => request<T>("POST", url, form),
};

export function qs(params: Record<string, string | number | null | undefined | string[]>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => x && p.append(k, x));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Full page load. Used after sign-in, sign-out and account deletion so no cached
 * data from the previous session survives in memory.
 */
export function hardNavigate(url: string) {
  navigating = true;
  window.location.href = url;
}
