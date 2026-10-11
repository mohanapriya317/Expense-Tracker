import "server-only";
import { formatMoney } from "@/lib/money";
import type { MonthReport } from "./analytics";

// PDFKit's built-in fonts have no ₹ glyph, so PDFs spell the currency out.
function pdfMoney(minor: number, currency: string) {
  return formatMoney(minor, currency).replace("₹", "Rs. ");
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export async function reportPdf(report: MonthReport, currency: string, userName: string): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const ink = "#111827";
  const muted = "#5B6475";
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc.fillColor(ink).font("Helvetica-Bold").fontSize(20).text(`Spending report: ${report.label}`);
  doc.moveDown(0.2).font("Helvetica").fontSize(10).fillColor(muted).text(`${userName} · generated ${fmtDate(new Date())}`);
  doc.moveDown(1);

  const change = report.changePct == null ? "no spending last month" : `${report.changePct > 0 ? "+" : ""}${report.changePct}% vs ${report.prevLabel}`;
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(26).text(pdfMoney(report.total, currency));
  doc.font("Helvetica").fontSize(11).fillColor(muted).text(`${report.count} expenses · ${pdfMoney(report.avgPerDay, currency)} per day · ${change}`);
  doc.moveDown(1.2);

  const table = (title: string, headers: string[], rows: string[][], widths: number[]) => {
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(13).text(title, left);
    doc.moveDown(0.4);
    const drawRow = (cells: string[], bold: boolean) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const y = doc.y;
      let x = left;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(bold ? muted : ink);
      cells.forEach((c, i) => {
        const w = widths[i] * width;
        doc.text(c, x, y, { width: w - 8, align: i === 0 ? "left" : "right", lineBreak: false, ellipsis: true });
        x += w;
      });
      doc.moveDown(0.5);
      doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor("#E2E5EA").lineWidth(0.5).stroke();
      doc.moveDown(0.4);
    };
    drawRow(headers, true);
    rows.forEach((r) => drawRow(r, false));
    doc.moveDown(1);
  };

  table(
    "By category",
    ["Category", report.label, report.prevLabel, "Change"],
    report.categories.map((c) => [c.name, pdfMoney(c.current, currency), pdfMoney(c.previous, currency), c.changePct == null ? "new" : `${c.changePct > 0 ? "+" : ""}${c.changePct}%`]),
    [0.4, 0.2, 0.2, 0.2],
  );

  if (report.topMerchants.length) {
    table("Top merchants", ["Merchant", "Total"], report.topMerchants.map((m) => [m.name, pdfMoney(m.total, currency)]), [0.7, 0.3]);
  }

  table(
    "Transactions",
    ["Date", "Description", "Category", "Amount"],
    report.transactions.map((t) => [fmtDate(t.occurredAt), t.title, t.category?.name ?? "", pdfMoney(t.myShare, currency)]),
    [0.18, 0.42, 0.2, 0.2],
  );

  doc.end();
  return done;
}

export async function reportXlsx(report: MonthReport, currency: string): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const money = (m: number) => m / 100;
  const numFmt = currency === "INR" ? '"₹"#,##0.00' : "#,##0.00";

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 18 }];
  summary.addRows([
    ["Month", report.label],
    ["Total spent", money(report.total)],
    [`Total ${report.prevLabel}`, money(report.prevTotal)],
    ["Change", report.changePct == null ? "n/a" : `${report.changePct}%`],
    ["Expenses", report.count],
    ["Average per day", money(report.avgPerDay)],
  ]);
  [2, 3, 6].forEach((r) => (summary.getCell(`B${r}`).numFmt = numFmt));
  summary.getColumn(1).font = { bold: true };

  const cats = wb.addWorksheet("By category");
  cats.columns = [
    { header: "Category", key: "name", width: 24 },
    { header: report.label, key: "current", width: 16, style: { numFmt } },
    { header: report.prevLabel, key: "previous", width: 16, style: { numFmt } },
    { header: "Change %", key: "changePct", width: 12 },
  ];
  report.categories.forEach((c) => cats.addRow({ name: c.name, current: money(c.current), previous: money(c.previous), changePct: c.changePct }));
  cats.getRow(1).font = { bold: true };

  const tx = wb.addWorksheet("Transactions");
  tx.columns = [
    { header: "Date", key: "date", width: 14, style: { numFmt: "dd mmm yyyy" } },
    { header: "Merchant", key: "merchant", width: 24 },
    { header: "Note", key: "note", width: 30 },
    { header: "Category", key: "category", width: 16 },
    { header: "Payment", key: "payment", width: 10 },
    { header: "Source", key: "source", width: 10 },
    { header: "Total", key: "amount", width: 14, style: { numFmt } },
    { header: "Your share", key: "share", width: 14, style: { numFmt } },
  ];
  report.transactions.forEach((t) =>
    tx.addRow({
      date: new Date(t.occurredAt),
      merchant: t.merchant,
      note: t.note,
      category: t.category?.name ?? "",
      payment: t.paymentMethod ?? "",
      source: t.source,
      amount: money(t.amount),
      share: money(t.myShare),
    }),
  );
  tx.getRow(1).font = { bold: true };
  tx.autoFilter = { from: "A1", to: "H1" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
