import { after } from "next/server";
import { parseExpenseText } from "@/lib/parser";
import { requireUser } from "@/server/auth";
import { badRequest, route } from "@/server/http";
import { Category, Expense, type CategoryDoc } from "@/server/models";
import { checkBudgetAlerts } from "@/server/services/budgets";
import { parseContextFor } from "@/server/services/categories";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    const y = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return new Date(y, Number(dmy[2]) - 1, Number(dmy[1]), 12);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * CSV import. Expected headers (any order, case-insensitive): date, amount, category, merchant, note, payment.
 * Unknown categories are guessed from the merchant and note, falling back to Other.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a CSV file.");
  if (file.size > 2 * 1024 * 1024) throw badRequest("CSV files must be 2 MB or smaller.");
  const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw badRequest("The CSV has no rows.");

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = col("date", "occurredat", "transactiondate");
  const iAmount = col("amount", "total", "debit", "yourshare");
  const iCat = col("category");
  const iMerchant = col("merchant", "payee", "description");
  const iNote = col("note", "notes", "remarks");
  const iPay = col("payment", "paymentmethod", "mode");
  if (iDate < 0 || iAmount < 0) throw badRequest("The CSV needs at least 'date' and 'amount' columns.");

  const { ctx, byName, other } = await parseContextFor(user._id);
  const cats = await Category.find({ userId: user._id }).lean<CategoryDoc[]>();
  const docs: Record<string, unknown>[] = [];
  const errors: string[] = [];

  lines.slice(1, 5001).forEach((line, n) => {
    const cells = splitCsvLine(line);
    const date = parseDate(cells[iDate] ?? "");
    const amount = Math.round(Math.abs(Number((cells[iAmount] ?? "").replace(/[₹,\s]/g, ""))) * 100);
    if (!date || !amount) {
      errors.push(`Row ${n + 2}: missing date or amount`);
      return;
    }
    const merchant = iMerchant >= 0 ? cells[iMerchant] : "";
    const note = iNote >= 0 ? cells[iNote] : "";
    const catName = iCat >= 0 ? cells[iCat] : "";
    let cat = catName ? byName.get(catName.toLowerCase()) ?? cats.find((c) => c.name.toLowerCase() === catName.toLowerCase()) : undefined;
    if (!cat) {
      const guess = parseExpenseText(`${merchant} ${note} ${catName}`, ctx).categoryName;
      cat = (guess && byName.get(guess.toLowerCase())) || other;
    }
    const pay = (iPay >= 0 ? cells[iPay] : "").toLowerCase();
    docs.push({
      userId: user._id,
      amount,
      myShare: amount,
      currency: user.currency,
      categoryId: cat!._id,
      merchant,
      note,
      occurredAt: date,
      paymentMethod: /upi|gpay|phonepe|paytm/.test(pay) ? "UPI" : /cash/.test(pay) ? "Cash" : /card/.test(pay) ? "Card" : null,
      source: "import",
    });
  });

  if (docs.length) await Expense.insertMany(docs);
  after(() => checkBudgetAlerts(user, new Date()).catch(() => undefined));
  return Response.json({ imported: docs.length, skipped: errors.length, errors: errors.slice(0, 20) });
});
