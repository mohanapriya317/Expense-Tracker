import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { Types } from "mongoose";
import { parseReceiptText, type ParseContext, type ParseResult } from "@/lib/parser";
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

/** Local-disk storage. Swap for S3 / MinIO by keeping the same three functions. */
export async function saveReceiptFile(userId: Types.ObjectId, hash: string, ext: string, buf: Buffer) {
  const dir = path.resolve(env.uploadDir, "receipts", String(userId));
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${hash}.${ext}`);
  await writeFile(file, buf);
  return path.relative(path.resolve(env.uploadDir), file);
}

export async function readReceiptFile(relPath: string) {
  const root = path.resolve(env.uploadDir);
  const full = path.resolve(root, relPath);
  if (!full.startsWith(root)) throw new Error("Invalid receipt path");
  return readFile(full);
}

export async function deleteUserFiles(userId: Types.ObjectId) {
  await rm(path.resolve(env.uploadDir, "receipts", String(userId)), { recursive: true, force: true });
}

/** OCR with tesseract.js. The English model downloads on first use and is cached. */
export async function ocrImage(buf: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OCR timed out")), 45_000));
    const result = await Promise.race([worker.recognize(buf), timeout]);
    return result.data.text ?? "";
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

export interface ScanOutcome {
  status: "scanned" | "failed" | "unsupported";
  text: string;
  parsed: ParseResult | null;
  message?: string;
}

export async function scanReceipt(buf: Buffer, mime: string, ctx: ParseContext): Promise<ScanOutcome> {
  if (mime === "application/pdf") {
    return { status: "unsupported", text: "", parsed: null, message: "PDF receipts are saved, but please enter the details yourself." };
  }
  try {
    const text = await ocrImage(buf);
    if (!text.trim()) return { status: "failed", text: "", parsed: null, message: "We couldn't read any text. Please enter the details." };
    return { status: "scanned", text, parsed: parseReceiptText(text, ctx) };
  } catch (err) {
    console.error("[ocr]", err);
    return { status: "failed", text: "", parsed: null, message: "Scanning failed. Please enter the details yourself." };
  }
}
