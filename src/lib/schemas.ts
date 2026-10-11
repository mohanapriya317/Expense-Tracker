import { z } from "zod";

// Request schemas shared by route handlers and client forms.

const minor = z.number().int("Amount must be in whole paise.").positive("Enter an amount above zero.").max(10_000_000_000);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.");

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
  tzOffset: z.number().int().min(-720).max(840).optional(),
  timezone: z.string().max(60).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  currency: z.enum(["INR", "USD", "EUR", "GBP"]).optional(),
  timezone: z.string().max(60).optional(),
  tzOffset: z.number().int().min(-720).max(840).optional(),
  monthStartDay: z.number().int().min(1).max(28).optional(),
  onboarded: z.boolean().optional(),
  notificationPrefs: z.object({ inApp: z.boolean(), email: z.boolean(), push: z.boolean() }).partial().optional(),
});

export const onboardingSchema = z.object({
  currency: z.enum(["INR", "USD", "EUR", "GBP"]),
  monthStartDay: z.number().int().min(1).max(28),
  categoryKeys: z.array(z.string()).max(30),
  overallBudget: minor.nullable().optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(40),
  icon: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  keywords: z.array(z.string().trim().toLowerCase().max(40)).max(50).optional(),
  archived: z.boolean().optional(),
});

export const splitSchema = z.object({
  groupId: objectId,
  paidBy: z.string().min(1),
  method: z.enum(["equal", "exact", "percent"]),
  shares: z.array(z.object({ memberId: z.string().min(1), name: z.string().optional(), amount: z.number().int().min(0) })).min(2, "Pick at least two people."),
});

export const expenseSchema = z.object({
  amount: minor,
  categoryId: objectId,
  merchant: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
  occurredAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  paymentMethod: z.enum(["UPI", "Cash", "Card", "Other"]).nullable().optional(),
  source: z.enum(["text", "voice", "receipt", "manual", "import"]).default("manual"),
  receiptId: objectId.nullable().optional(),
  split: splitSchema.nullable().optional(),
  rawInput: z.string().max(1000).optional(),
  confidence: z.record(z.string()).optional(),
  original: z
    .object({ categoryName: z.string().nullable().optional(), merchant: z.string().nullable().optional(), amount: z.number().nullable().optional() })
    .optional(),
  learnRule: z.boolean().optional(),
});

export const expenseUpdateSchema = expenseSchema.partial().omit({ source: true, rawInput: true, confidence: true, original: true });

export const bulkSchema = z.object({
  ids: z.array(objectId).min(1).max(500),
  action: z.enum(["delete", "category"]),
  categoryId: objectId.optional(),
});

export const budgetSchema = z.object({
  categoryId: objectId.nullable(),
  limit: minor,
  alertAt: z.array(z.number().int().min(10).max(200)).min(1).max(4).optional(),
});

export const groupSchema = z.object({
  name: z.string().trim().min(1, "Name the group.").max(60),
  members: z.array(z.object({ name: z.string().trim().min(1).max(60), email: z.string().trim().email().or(z.literal("")).optional() })).max(30),
});

export const settleSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  amount: minor,
  note: z.string().max(200).optional(),
});

export const parseSchema = z.object({ text: z.string().trim().min(1).max(500), source: z.enum(["text", "voice"]).default("text") });

export const assistantSchema = z.object({ message: z.string().trim().min(1).max(500) });

export type ExpenseInput = z.infer<typeof expenseSchema>;
