import { requireUser } from "@/server/auth";
import { notFound, oid, route } from "@/server/http";
import { Receipt, type ReceiptDoc } from "@/server/models";
import { readReceiptFile } from "@/server/services/receipts";

/** Streams a receipt image back to its owner only. */
export const GET = route<RouteContext<"/api/receipts/[id]">>(async (_req, ctx) => {
  const user = await requireUser();
  const id = oid((await ctx.params).id, "Receipt not found.");
  const receipt = await Receipt.findOne({ _id: id, userId: user._id }).lean<ReceiptDoc>();
  if (!receipt) throw notFound("Receipt not found.");
  const buf = await readReceiptFile(receipt.filePath).catch(() => null);
  if (!buf) throw notFound("Receipt file is missing.");
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": receipt.mimeType ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
});
