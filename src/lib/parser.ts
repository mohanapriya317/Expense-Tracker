// Rule-based expense extraction. Runs on the client (live parse chips while typing)
// and on the server (final parse with the user's own categories and rules).
// It stands in for an LLM: the output shape is the same one a model would return,
// so a real provider can replace it later without touching callers.

import { DEFAULT_CATEGORIES, KNOWN_MERCHANTS } from "./categories";

export type Confidence = "high" | "low" | "none";

export interface ParseCategory {
  name: string;
  keywords?: string[];
}

export interface ParseRule {
  match: string;
  categoryName: string;
}

export interface ParseContext {
  now?: Date;
  categories?: ParseCategory[];
  rules?: ParseRule[];
}

export interface ParseResult {
  amount: number | null; // minor units
  categoryName: string | null;
  merchant: string | null;
  occurredAt: string | null; // ISO; null = now
  paymentMethod: "UPI" | "Cash" | "Card" | null;
  note: string;
  splitWith: string[];
  confidence: {
    amount: Confidence;
    category: Confidence;
    merchant: Confidence;
    date: Confidence;
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)";

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, lakh: 100000, lakhs: 100000 };

const FILLER = new Set(["on", "for", "at", "spent", "paid", "pay", "rs", "rs.", "inr", "rupees", "rupee", "the", "a", "an", "of", "to", "via", "by", "using", "from", "and", "in", "bought", "got", "my", "-", "/-"]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function withTimeOf(day: Date, now: Date): Date {
  const x = new Date(day);
  x.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return x;
}

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toLowerCase());
}

function weekdayIndex(word: string): number {
  const w = word.slice(0, 3).toLowerCase();
  return WEEKDAYS.findIndex((d) => d.startsWith(w));
}

function notInFuture(d: Date, now: Date): Date {
  if (d.getTime() > now.getTime() + 24 * 3600 * 1000) {
    const x = new Date(d);
    x.setFullYear(x.getFullYear() - 1);
    return x;
  }
  return d;
}

interface DateHit {
  date: Date;
  match: string;
}

export function extractDate(text: string, now: Date): DateHit | null {
  const lower = text.toLowerCase();
  let m: RegExpMatchArray | null;

  if ((m = lower.match(/\bday before yesterday\b/))) {
    const d = startOfDay(now);
    d.setDate(d.getDate() - 2);
    return { date: withTimeOf(d, now), match: m[0] };
  }
  if ((m = lower.match(/\byesterday\b/))) {
    const d = startOfDay(now);
    d.setDate(d.getDate() - 1);
    return { date: withTimeOf(d, now), match: m[0] };
  }
  if ((m = lower.match(/\b(today|tonight|this morning|this evening)\b/))) {
    return { date: now, match: m[0] };
  }
  if ((m = lower.match(/\b(\d{1,2})\s+days?\s+ago\b/))) {
    const d = startOfDay(now);
    d.setDate(d.getDate() - Number(m[1]));
    return { date: withTimeOf(d, now), match: m[0] };
  }
  // 5 oct, 5th october 2026
  if ((m = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`)))) {
    const day = Number(m[1]);
    const mon = monthIndex(m[2]);
    const year = m[3] ? Number(m[3]) : now.getFullYear();
    if (day >= 1 && day <= 31 && mon >= 0) {
      const d = new Date(year, mon, day, 12, 0, 0);
      return { date: m[3] ? d : notInFuture(d, now), match: m[0] };
    }
  }
  // oct 5, october 5th 2026
  if ((m = lower.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`)))) {
    const mon = monthIndex(m[1]);
    const day = Number(m[2]);
    const year = m[3] ? Number(m[3]) : now.getFullYear();
    if (day >= 1 && day <= 31 && mon >= 0) {
      const d = new Date(year, mon, day, 12, 0, 0);
      return { date: m[3] ? d : notInFuture(d, now), match: m[0] };
    }
  }
  // 05/10/2026, 5-10-26, 5/10 (day first, Indian format)
  if ((m = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    const day = Number(m[1]);
    const mon = Number(m[2]) - 1;
    let year = m[3] ? Number(m[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) {
      const d = new Date(year, mon, day, 12, 0, 0);
      return { date: m[3] ? d : notInFuture(d, now), match: m[0] };
    }
  }
  // 2026-10-05
  if ((m = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    return { date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12), match: m[0] };
  }
  // last monday, on friday
  if ((m = lower.match(new RegExp(`\\b(last|on|this)?\\s*${WEEKDAY_RE}\\b`)))) {
    const target = weekdayIndex(m[2]);
    if (target >= 0) {
      const d = startOfDay(now);
      let diff = (d.getDay() - target + 7) % 7;
      if (diff === 0 && m[1] === "last") diff = 7;
      d.setDate(d.getDate() - diff);
      return { date: withTimeOf(d, now), match: m[0].trim() };
    }
  }
  return null;
}

function wordsToNumber(tokens: string[]): { value: number; length: number } | null {
  let total = 0;
  let current = 0;
  let used = 0;
  let sawAny = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "and" && sawAny) {
      used++;
      continue;
    }
    if (t in UNITS) {
      // "one fifty" (colloquial 150): a unit directly followed by a tens word
      const next = tokens[i + 1];
      if (current === 0 && total === 0 && next && next in TENS && UNITS[t] > 0 && UNITS[t] < 10) {
        current = UNITS[t] * 100;
        sawAny = true;
        used++;
        continue;
      }
      current += UNITS[t];
    } else if (t in TENS) {
      current += TENS[t];
    } else if (t in SCALES) {
      const scale = SCALES[t];
      if (scale === 100) {
        current = (current || 1) * 100;
      } else {
        total += (current || 1) * scale;
        current = 0;
      }
    } else {
      break;
    }
    sawAny = true;
    used++;
  }
  if (!sawAny) return null;
  return { value: total + current, length: used };
}

interface AmountHit {
  value: number; // major units
  match: string;
  hasCurrency: boolean;
}

const MONEY_RE = /(₹|rs\.?|inr|rupees?)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?\s*(k|thousand|lakhs?|l)?\b\s*(rs|rupees|inr|\/-)?/gi;

function findAmounts(text: string): AmountHit[] {
  const hits: AmountHit[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const raw = m[2].replace(/,/g, "");
    let value = Number(raw) + (m[3] ? Number(`0.${m[3]}`) : 0);
    const suffix = (m[4] || "").toLowerCase();
    if (suffix === "k" || suffix === "thousand") value *= 1000;
    if (suffix.startsWith("l")) value *= 100000;
    if (!Number.isFinite(value) || value <= 0) continue;
    hits.push({ value, match: m[0], hasCurrency: Boolean(m[1] || m[5]) });
  }
  return hits;
}

function extractAmount(text: string): { hit: AmountHit | null; confidence: Confidence } {
  const hits = findAmounts(text);
  if (hits.length) {
    const withCurrency = hits.filter((h) => h.hasCurrency);
    if (withCurrency.length) return { hit: withCurrency[withCurrency.length - 1], confidence: "high" };
    const best = hits.reduce((a, b) => (b.value >= a.value ? b : a));
    return { hit: best, confidence: hits.length === 1 ? "high" : "low" };
  }
  // Spoken numbers: "petrol hundred", "lunch two fifty"
  const tokens = text.toLowerCase().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const res = wordsToNumber(tokens.slice(i));
    if (res && res.value > 0) {
      return {
        hit: { value: res.value, match: tokens.slice(i, i + res.length).join(" "), hasCurrency: false },
        confidence: "high",
      };
    }
  }
  return { hit: null, confidence: "none" };
}

function extractPayment(lower: string): { method: ParseResult["paymentMethod"]; match: string | null } {
  let m = lower.match(/\b(?:via|by|using|through|with|on)?\s*(upi|gpay|google pay|phonepe|phone pe|paytm|bhim)\b/);
  if (m) return { method: "UPI", match: m[0] };
  m = lower.match(/\b(?:via|by|using|in|with)?\s*cash\b/);
  if (m) return { method: "Cash", match: m[0] };
  m = lower.match(/\b(?:via|by|using|with|on)?\s*(?:my\s+)?(credit card|debit card|card|visa|mastercard|rupay|amex)\b/);
  if (m) return { method: "Card", match: m[0] };
  return { method: null, match: null };
}

function extractSplit(text: string): { names: string[]; match: string | null } {
  const m = text.match(/\b(?:split\s+)?with\s+([a-z][a-z.']*(?:\s*(?:,|and|&)\s*[a-z][a-z.']*)*)/i);
  if (!m) return { names: [], match: null };
  const names = m[1]
    .split(/\s*(?:,|\band\b|&)\s*/i)
    .map((n) => n.trim())
    .filter((n) => n && !FILLER.has(n.toLowerCase()))
    .map((n) => titleCase(n.toLowerCase()));
  return { names, match: m[0] };
}

function extractMerchant(text: string): { merchant: string | null; confidence: Confidence } {
  const lower = text.toLowerCase();
  const keys = Object.keys(KNOWN_MERCHANTS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (new RegExp(`\\b${escapeRe(k)}\\b`).test(lower)) return { merchant: KNOWN_MERCHANTS[k], confidence: "high" };
  }
  const m = text.match(/\b(?:at|from|@|paid to)\s+([A-Za-z][\w'&.-]*(?:\s+[A-Za-z][\w'&.-]*){0,2})/);
  if (m) {
    const words = m[1].split(/\s+/).filter((w) => !FILLER.has(w.toLowerCase()) && !/^\d/.test(w));
    if (words.length) return { merchant: titleCase(words.join(" ")), confidence: "low" };
  }
  return { merchant: null, confidence: "none" };
}

function allCategories(ctx: ParseContext): ParseCategory[] {
  const fromDefaults = DEFAULT_CATEGORIES.map((c) => ({ name: c.name, keywords: c.keywords }));
  if (!ctx.categories?.length) return fromDefaults;
  return ctx.categories.map((c) => {
    const def = DEFAULT_CATEGORIES.find((d) => d.name.toLowerCase() === c.name.toLowerCase());
    return { name: c.name, keywords: [...(c.keywords ?? []), ...(def?.keywords ?? [])] };
  });
}

export function extractCategory(text: string, ctx: ParseContext): { name: string | null; confidence: Confidence } {
  const lower = text.toLowerCase();
  for (const rule of ctx.rules ?? []) {
    if (rule.match && new RegExp(`\\b${escapeRe(rule.match.toLowerCase())}\\b`).test(lower)) {
      return { name: rule.categoryName, confidence: "high" };
    }
  }
  let best: { name: string; len: number } | null = null;
  for (const c of allCategories(ctx)) {
    const words = [c.name.toLowerCase(), ...(c.keywords ?? [])];
    for (const w of words) {
      if (!w) continue;
      if (new RegExp(`\\b${escapeRe(w)}\\b`).test(lower) && (!best || w.length > best.len)) {
        best = { name: c.name, len: w.length };
      }
    }
  }
  if (best) return { name: best.name, confidence: "high" };
  return { name: null, confidence: "none" };
}

function removeOnce(text: string, part: string | null): string {
  if (!part) return text;
  const idx = text.toLowerCase().indexOf(part.toLowerCase().trim());
  if (idx < 0) return text;
  return text.slice(0, idx) + " " + text.slice(idx + part.trim().length);
}

/** Parse a typed or spoken expense like "petrol 200 at shell yesterday via upi". */
export function parseExpenseText(input: string, ctx: ParseContext = {}): ParseResult {
  const now = ctx.now ?? new Date();
  const text = input.trim().replace(/\s+/g, " ");
  let rest = text;

  const dateHit = extractDate(rest, now);
  rest = removeOnce(rest, dateHit?.match ?? null);

  const payment = extractPayment(rest.toLowerCase());
  rest = removeOnce(rest, payment.match);

  const split = extractSplit(rest);
  rest = removeOnce(rest, split.match);

  const amount = extractAmount(rest);
  rest = removeOnce(rest, amount.hit?.match ?? null);

  const merchant = extractMerchant(text);
  const category = extractCategory(text, ctx);

  const note = rest
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w.toLowerCase()) && !/^[₹,.]+$/.test(w))
    .join(" ")
    .replace(/^\W+|\W+$/g, "");

  return {
    amount: amount.hit ? Math.round(amount.hit.value * 100) : null,
    categoryName: category.name,
    merchant: merchant.merchant,
    occurredAt: dateHit ? dateHit.date.toISOString() : null,
    paymentMethod: payment.method,
    note: note ? note.charAt(0).toUpperCase() + note.slice(1) : "",
    splitWith: split.names,
    confidence: {
      amount: amount.confidence,
      category: category.confidence,
      merchant: merchant.confidence,
      // No date mentioned means "now", which is almost always right for quick entry.
      date: "high",
    },
  };
}

/** Parse OCR text from a receipt or an online payment screenshot. */
export function parseReceiptText(raw: string, ctx: ParseContext = {}): ParseResult {
  const now = ctx.now ?? new Date();
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const text = lines.join("\n");
  const lower = text.toLowerCase();

  // Amount: prefer grand total / net payable lines, then any total line, then the largest figure.
  let amountMinor: number | null = null;
  let amountConf: Confidence = "none";
  const scored: { value: number; score: number }[] = [];
  lines.forEach((line, i) => {
    const l = line.toLowerCase();
    let score = 0;
    if (/grand\s*total|net\s*(amount|payable)|amount\s*(paid|payable)|total\s*payable|to\s*pay|you\s*paid|paid\s*to/.test(l)) score = 3;
    else if (/\btotal\b/.test(l) && !/sub\s*-?\s*total/.test(l)) score = 2;
    else if (/₹|rs\.?|inr/.test(l)) score = 1;
    const amounts = findAmounts(line).filter((a) => !/^\d{4}$/.test(a.match.trim()) || a.hasCurrency);
    for (const a of amounts) scored.push({ value: a.value, score: score * 1000 + i });
  });
  if (scored.length) {
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    amountMinor = Math.round(best.value * 100);
    amountConf = best.score >= 2000 ? "high" : "low";
    if (best.score < 1000) {
      const max = scored.reduce((a, b) => (b.value > a.value ? b : a));
      amountMinor = Math.round(max.value * 100);
      amountConf = "low";
    }
  }

  const dateHit = extractDate(text, now);
  let occurredAt = dateHit?.date ?? null;
  const time = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i);
  if (occurredAt && time) {
    let h = Number(time[1]);
    if (time[3]?.toLowerCase() === "pm" && h < 12) h += 12;
    if (time[3]?.toLowerCase() === "am" && h === 12) h = 0;
    occurredAt = new Date(occurredAt);
    occurredAt.setHours(h, Number(time[2]), 0, 0);
  }

  let merchant = extractMerchant(text);
  const paidTo = text.match(/paid\s+to\s*:?\s*([^\n]+)/i);
  if (merchant.confidence !== "high" && paidTo) {
    merchant = { merchant: titleCase(paidTo[1].replace(/[^\w\s&'.-]/g, "").trim().toLowerCase()), confidence: "high" };
  }
  if (!merchant.merchant) {
    const first = lines.find((l) => /[a-z]{3,}/i.test(l) && !/tax|invoice|receipt|gst|bill no|cash memo|welcome/i.test(l));
    if (first) merchant = { merchant: titleCase(first.toLowerCase()).slice(0, 60), confidence: "low" };
  }

  const category = extractCategory(`${text}\n${merchant.merchant ?? ""}`, ctx);
  const payment = extractPayment(lower);

  return {
    amount: amountMinor,
    categoryName: category.name,
    merchant: merchant.merchant,
    occurredAt: occurredAt ? occurredAt.toISOString() : null,
    paymentMethod: payment.method,
    note: "",
    splitWith: [],
    confidence: {
      amount: amountConf,
      category: category.name ? "high" : "none",
      merchant: merchant.confidence,
      date: dateHit ? "high" : "low",
    },
  };
}
