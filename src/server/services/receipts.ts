import "server-only";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Types } from "mongoose";
import { parseReceiptText, type ParseContext, type ParseResult } from "@/lib/parser";
import type { ReceiptDoc } from "../models";
import { env } from "../env";

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Receipt bytes live on the Receipt document itself (`data`, capped at 10 MB, well under Mongo's 16 MB),
 * so uploads work on read-only serverless filesystems. Older receipts may still point at a local file.
 */
export async function readReceiptFile(receipt: Pick<ReceiptDoc, "data" | "filePath">) {
  if (receipt.data) return Buffer.from(receipt.data.buffer, receipt.data.byteOffset, receipt.data.byteLength);
  if (!receipt.filePath) throw new Error("Receipt has no file");
  const root = path.resolve(env.uploadDir);
  const full = path.resolve(root, receipt.filePath);
  if (!full.startsWith(root)) throw new Error("Invalid receipt path");
  return readFile(full);
}

/** Removes legacy on-disk receipts. Missing or read-only folders are fine. */
export async function deleteUserFiles(userId: Types.ObjectId) {
  await rm(path.resolve(env.uploadDir, "receipts", String(userId)), { recursive: true, force: true }).catch(() => undefined);
}

/** OCR with tesseract.js. The English model downloads on first use and is cached in the temp dir. */
export async function ocrImage(buf: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, { cachePath: tmpdir() });
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OCR timed out")), 45_000));
    const result = await Promise.race([worker.recognize(buf), timeout]);
    return result.data.text ?? "";
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

/** Uses the PDF's text layer when it has one; otherwise renders the first page and OCRs it. */
export async function readPdf(buf: Buffer): Promise<string> {
  const { extractText, renderPageAsImage } = await import("unpdf");
  // pdf.js takes ownership of the bytes it is given, so each call gets its own copy.
  const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
  if (text.replace(/\s/g, "").length > 20) return text;
  const png = await renderPageAsImage(new Uint8Array(buf), 1, { canvasImport: () => import("@napi-rs/canvas"), scale: 3 });
  return ocrImage(Buffer.from(png));
}

export interface ScanOutcome {
  status: "scanned" | "failed" | "unsupported";
  text: string;
  parsed: ParseResult | null;
  message?: string;
}

export async function scanReceipt(buf: Buffer, mime: string, ctx: ParseContext): Promise<ScanOutcome> {
  try {
    const text = mime === "application/pdf" ? await readPdf(buf) : await ocrImage(buf);
    if (!text.trim()) return { status: "failed", text: "", parsed: null, message: "We couldn't read any text. Please enter the details." };
    return { status: "scanned", text, parsed: parseReceiptText(text, ctx) };
  } catch (err) {
    console.error("[ocr]", err);
    return { status: "failed", text: "", parsed: null, message: "Scanning failed. Please enter the details yourself." };
  }
}
