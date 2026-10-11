import { requireUser } from "@/server/auth";
import { route } from "@/server/http";
import { computeHealth } from "@/server/services/analytics";

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json(await computeHealth(user));
});
