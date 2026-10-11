// Response shapes returned by the API, as the client sees them (dates are ISO strings).

import type { Confidence, ParseResult } from "./parser";

export interface Me {
  id: string;
  email: string;
  name: string;
  currency: string;
  timezone: string;
  tzOffset: number;
  monthStartDay: number;
  onboarded: boolean;
  isDemo: boolean;
  notificationPrefs: { inApp: boolean; email: boolean; push: boolean };
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  keywords: string[];
  isDefault: boolean;
  archived: boolean;
  expenseCount?: number;
}

export interface CategoryRef {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface SplitShare {
  memberId: string;
  name?: string;
  amount: number;
}

export interface Expense {
  id: string;
  amount: number;
  myShare: number;
  currency: string;
  categoryId: string;
  category: CategoryRef | null;
  merchant: string;
  note: string;
  title: string;
  occurredAt: string;
  paymentMethod: "UPI" | "Cash" | "Card" | "Other" | null;
  source: "text" | "voice" | "receipt" | "manual" | "import" | "demo";
  receiptId: string | null;
  split: { groupId: string | null; paidBy: string; method: "equal" | "exact" | "percent"; shares: SplitShare[] } | null;
  aiMeta: { confidence: Record<string, Confidence> | null; edited: string[]; rawInput: string } | null;
  createdAt: string;
}

export interface ExpenseList {
  items: Expense[];
  total: number;
  sum: number;
  page: number;
  limit: number;
}

export interface ParseResponse {
  parsed: ParseResult;
  categoryId: string | null;
  duplicate: Expense | null;
}

export interface ReceiptResponse {
  receiptId: string;
  status: "scanned" | "failed" | "unsupported";
  message?: string;
  parsed: ParseResult | null;
  categoryId: string | null;
  duplicate: { kind: "exact" | "similar"; expense: Expense } | null;
}

export type BudgetState = "safe" | "warning" | "over";

export interface BudgetItem {
  id: string;
  categoryId: string | null;
  category: CategoryRef | null;
  limit: number;
  alertAt: number[];
  spent: number;
  left: number;
  pct: number;
  projected: number;
  state: BudgetState;
}

export interface Progress {
  daysElapsed: number;
  daysLeft: number;
  isCurrent: boolean;
  isPast: boolean;
}

export interface BudgetsResponse {
  monthKey: string;
  label: string;
  progress: Progress;
  totalSpent: number;
  overall: BudgetItem | null;
  categories: BudgetItem[];
}

export interface Dashboard {
  monthKey: string;
  label: string;
  progress: Progress;
  total: number;
  count: number;
  prevTotal: number;
  changePct: number | null;
  overallBudget: BudgetItem | null;
  categoryBudgets: BudgetItem[];
  alerts: { id: string; name: string; pct: number; state: BudgetState; left: number; limit: number }[];
  byCategory: { categoryId: string; name: string; color: string; icon: string; total: number }[];
  daily: { day: number; current: number | null; previous: number | null }[];
  recent: Expense[];
  health: { score: number; label: string; tip: string | null };
}

export interface Insights {
  monthKey: string;
  score: number;
  label: string;
  factors: { name: string; points: number; max: number; detail: string }[];
  tips: string[];
  forecast: {
    spent: number;
    projected: number;
    budget: number | null;
    avgPrev: number;
    nextMonth: number;
    history: { month: string; total: number }[];
    categories: { name: string; color: string; spent: number; projected: number; limit: number | null }[];
  };
}

export interface Report {
  monthKey: string;
  label: string;
  prevLabel: string;
  total: number;
  prevTotal: number;
  changePct: number | null;
  count: number;
  avgPerDay: number;
  categories: { categoryId: string; name: string; color: string; current: number; previous: number; change: number; changePct: number | null }[];
  biggestChanges: Report["categories"];
  topMerchants: { name: string; total: number }[];
  transactions: Expense[];
}

export interface GroupMember {
  id: string;
  name: string;
  email: string;
  isMe: boolean;
  balance: number;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  members: GroupMember[];
  myBalance: number;
  totalSpent: number;
  expenseCount: number;
  transfers: { from: string; to: string; amount: number; fromName: string; toName: string }[];
  settlements: { id: string; from: string; to: string; fromName: string; toName: string; amount: number; date: string; note: string }[];
}

export interface AppNotification {
  id: string;
  type: "budget-warning" | "budget-exceeded" | "split" | "system";
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}

export interface AssistantReply {
  answer: string;
  chart?: { title: string; data: { label: string; value: number }[] };
  links?: { label: string; href: string }[];
  suggestions?: string[];
}
