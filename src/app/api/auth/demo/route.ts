import { z } from "zod";
import { publicUser, startSession } from "@/server/auth";
import { connectDb } from "@/server/db";
import { env } from "@/server/env";
import { ApiError, rateLimit, route } from "@/server/http";
import { resetDemoUser } from "@/server/services/demo";

export const maxDuration = 60;

const schema = z.object({ tzOffset: z.number().int().min(-720).max(840).optional() });

/** Signs in to a freshly seeded demo account (enabled with ALLOW_DEMO=true). */
export const POST = route(async (req) => {
  if (!env.allowDemo) throw new ApiError(403, "The demo account is turned off.");
  rateLimit("demo", 20, 60_000);
  const body = schema.parse(await req.json().catch(() => ({})));
  await connectDb();
  const user = await resetDemoUser(body.tzOffset);
  await startSession(String(user._id));
  return Response.json({ user: publicUser(user) });
});
