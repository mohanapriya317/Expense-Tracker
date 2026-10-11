import { loginSchema } from "@/lib/schemas";
import { publicUser, startSession, verifyPassword } from "@/server/auth";
import { connectDb } from "@/server/db";
import { ApiError, rateLimit, readJson, route } from "@/server/http";
import { User, type UserDoc } from "@/server/models";

export const POST = route(async (req) => {
  const input = await readJson(req, loginSchema);
  rateLimit(`login:${input.email.toLowerCase()}`, 10, 5 * 60_000);
  await connectDb();
  const user = await User.findOne({ email: input.email.toLowerCase() }).lean<UserDoc>();
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new ApiError(401, "Email or password is incorrect.");
  }
  await startSession(String(user._id));
  return Response.json({ user: publicUser(user) });
});
