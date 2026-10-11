import { signupSchema } from "@/lib/schemas";
import { hashPassword, publicUser, startSession } from "@/server/auth";
import { connectDb } from "@/server/db";
import { ApiError, readJson, route } from "@/server/http";
import { User, type UserDoc } from "@/server/models";

export const POST = route(async (req) => {
  const input = await readJson(req, signupSchema);
  await connectDb();
  const email = input.email.toLowerCase();
  if (await User.exists({ email })) {
    throw new ApiError(409, "An account with this email already exists.", { email: "Already registered. Sign in instead." });
  }
  const user = await User.create({
    name: input.name,
    email,
    passwordHash: await hashPassword(input.password),
    tzOffset: input.tzOffset ?? 330,
    timezone: input.timezone ?? "Asia/Kolkata",
  });
  await startSession(String(user._id));
  return Response.json({ user: publicUser(user.toObject() as UserDoc) }, { status: 201 });
});
