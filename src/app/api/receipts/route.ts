import { requireUser } from "@/server/auth";
import { badRequest, rateLimit, route } from "@/server/http";
import { Expense, Receipt, type ExpenseDoc, type ReceiptDoc } from "@/server/models";
import { parseContextFor } from "@/server/services/categories";
import { categoryMap, findSimilarReceiptExpense, serializeExpense } from "@/server/services/expenses";
import { MAX_RECEIPT_BYTES, RECEIPT_TYPES, scanReceipt, sha256 } from "@/server/services/receipts";

export const maxDuration = 60;

/**
 * Receipt / screenshot upload: store the file, run OCR, extract fields and check for duplicates
 * (exact same file, or same merchant and amount within a day).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`receipt:${user._id}`, 20);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a receipt image.");
  if (file.size > MAX_RECEIPT_BYTES) throw badRequest("Receipts must be 10 MB or smaller.");
  if (!RECEIPT_TYPES[file.type]) throw badRequest("Use a JPG, PNG, WebP or PDF file.");

  const buf = Buffer.from(await file.arrayBuffer());
  const hash = sha256(buf);
  const cats = await categoryMap(user._id);

  // Exact duplicate: this very file was uploaded before.
  const previous = await Receipt.findOne({ userId: user._id, sha256: hash }).sort({ createdAt: -1 }).lean<ReceiptDoc>();
  const previousExpense = previous?.expenseId ? await Expense.findOne({ _id: previous.expenseId, userId: user._id }).lean<ExpenseDoc>() : null;

  const { ctx, byName, other } = await parseContextFor(user._id);
  const scan = previous?.extracted && previous.status === "scanned"
    ? { status: "scanned" as const, text: previous.ocrText, parsed: previous.extracted }
    : await scanReceipt(buf, file.type, ctx);

  const receipt = await Receipt.create({
    userId: user._id,
    data: buf,
    mimeType: file.type,
    size: file.size,
    sha256: hash,
    ocrText: scan.text,
    extracted: scan.parsed,
    status: scan.status,
  });

  const parsed = scan.parsed;
  let categoryId: string | null = other ? String(other._id) : null;
  if (parsed?.categoryName && byName.has(parsed.categoryName.toLowerCase())) {
    categoryId = String(byName.get(parsed.categoryName.toLowerCase())!._id);
  } else if (parsed) {
    parsed.confidence.category = "low";
  }

  let duplicate: { kind: "exact" | "similar"; expense: ReturnType<typeof serializeExpense> } | null = previousExpense
    ? { kind: "exact", expense: serializeExpense(previousExpense, cats) }
    : null;
  if (!duplicate && parsed) {
    const similar = await findSimilarReceiptExpense(user._id, parsed.amount, parsed.merchant, parsed.occurredAt ? new Date(parsed.occurredAt) : null);
    if (similar) duplicate = { kind: "similar", expense: serializeExpense(similar, cats) };
  }

  return Response.json({
    receiptId: String(receipt._id),
    status: scan.status,
    message: "message" in scan ? scan.message : undefined,
    parsed,
    categoryId,
    duplicate,
  });
});
