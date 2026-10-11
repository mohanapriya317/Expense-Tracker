import { assistantSchema } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { rateLimit, readJson, route } from "@/server/http";
import { answer, SUGGESTIONS } from "@/server/services/assistant";

export const GET = route(async () => {
  await requireUser();
  return Response.json({ suggestions: SUGGESTIONS });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`assistant:${user._id}`, 60);
  const { message } = await readJson(req, assistantSchema);
  return Response.json(await answer(user, message));
});
