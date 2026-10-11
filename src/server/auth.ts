import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { connectDb } from "./db";
import { User, type UserDoc } from "./models";
import { ApiError } from "./http";

export const SESSION_COOKIE = "et_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function startSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(env.authSecret);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

async function sessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.authSecret);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Loads the signed-in user or throws 401. Every data query is then scoped by user._id. */
export async function requireUser(): Promise<UserDoc> {
  const id = await sessionUserId();
  if (!id) throw new ApiError(401, "Please sign in.");
  await connectDb();
  const user = await User.findById(id).lean<UserDoc>();
  if (!user) throw new ApiError(401, "Please sign in.");
  return user;
}

export function publicUser(u: UserDoc) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    currency: u.currency,
    timezone: u.timezone,
    tzOffset: u.tzOffset,
    monthStartDay: u.monthStartDay,
    onboarded: u.onboarded,
    isDemo: u.isDemo,
    notificationPrefs: u.notificationPrefs,
  };
}
