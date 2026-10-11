import "server-only";
import { Types } from "mongoose";
import { ZodError, type z, type ZodTypeAny } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new ApiError(404, what);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: turns thrown errors into consistent JSON responses. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return Response.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const fields = Object.fromEntries(err.issues.map((i) => [i.path.join(".") || "body", i.message]));
        return Response.json({ error: "Please check the highlighted fields.", details: fields }, { status: 400 });
      }
      if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
        return Response.json({ error: "That already exists." }, { status: 409 });
      }
      console.error("[api]", req.method, new URL(req.url).pathname, err);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export async function readJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw badRequest("Request body must be JSON.");
  }
  return schema.parse(data);
}

export function oid(id: string | null | undefined, what = "Not found"): Types.ObjectId {
  if (!id || !Types.ObjectId.isValid(id)) throw notFound(what);
  return new Types.ObjectId(id);
}

export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

// Minimal in-memory rate limiter for the AI-style endpoints (per user, per route).
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) throw new ApiError(429, "Too many requests. Please wait a moment.");
}
