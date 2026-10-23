import "server-only";
import mongoose, { Schema, type Model, type SchemaOptions, Types } from "mongoose";

// Schema definitions are typed loosely on purpose: letting TypeScript infer Mongoose's
// types from large nested definitions exhausts the compiler's memory. Documents are
// typed by the explicit interfaces below instead.
type Definition = Record<string, unknown>;
function schema(def: Definition, opts?: SchemaOptions): Schema {
  return new Schema(def as never, opts);
}

// Every document is scoped by userId (or ownerId for groups).
// Money fields are integer minor units (paise).


const userSchema = schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    currency: { type: String, default: "INR" },
    timezone: { type: String, default: "Asia/Kolkata" },
    tzOffset: { type: Number, default: 330 }, // minutes east of UTC
    monthStartDay: { type: Number, default: 1, min: 1, max: 28 },
    onboarded: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false },
    notificationPrefs: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

const categorySchema = schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: "circle-ellipsis" },
    color: { type: String, default: "#94A3B8" },
    keywords: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);
categorySchema.index({ userId: 1, name: 1 }, { unique: true });

const splitShareSchema = schema(
  { memberId: { type: String, required: true }, name: String, amount: { type: Number, required: true } },
  { _id: false },
);

const expenseSchema = schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true, min: 1 },
    myShare: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    categoryId: { type: Schema.Types.ObjectId, required: true },
    merchant: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
    occurredAt: { type: Date, required: true },
    paymentMethod: { type: String, enum: ["UPI", "Cash", "Card", "Other", null], default: null },
    source: { type: String, enum: ["text", "voice", "receipt", "manual", "import", "demo"], default: "manual" },
    receiptId: { type: Schema.Types.ObjectId, default: null },
    split: {
      type: schema(
        {
          groupId: { type: Schema.Types.ObjectId, default: null },
          paidBy: { type: String, required: true },
          method: { type: String, enum: ["equal", "exact", "percent"], default: "equal" },
          shares: { type: [splitShareSchema], default: [] },
        },
        { _id: false },
      ),
      default: null,
    },
    aiMeta: {
      rawInput: String,
      parser: String,
      confidence: Schema.Types.Mixed,
      original: Schema.Types.Mixed,
      edited: [String],
    },
  },
  { timestamps: true },
);
expenseSchema.index({ userId: 1, occurredAt: -1 });
expenseSchema.index({ userId: 1, categoryId: 1, occurredAt: -1 });
expenseSchema.index({ "split.groupId": 1, occurredAt: -1 });
expenseSchema.index({ merchant: "text", note: "text" });

const receiptSchema = schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    // Legacy local-disk path; new receipts keep their bytes in `data` (serverless hosts have no writable disk).
    filePath: String,
    data: { type: Buffer, select: false },
    mimeType: String,
    size: Number,
    sha256: { type: String, required: true },
    ocrText: { type: String, default: "" },
    extracted: Schema.Types.Mixed,
    status: { type: String, enum: ["scanned", "failed", "unsupported"], default: "scanned" },
    expenseId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);
receiptSchema.index({ userId: 1, sha256: 1 });

const ruleSchema = schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    match: { type: String, required: true, lowercase: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, required: true },
    hits: { type: Number, default: 0 },
  },
  { timestamps: true },
);
ruleSchema.index({ userId: 1, match: 1 }, { unique: true });

const budgetSchema = schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    categoryId: { type: Schema.Types.ObjectId, default: null }, // null = overall budget
    limit: { type: Number, required: true, min: 1 },
    alertAt: { type: [Number], default: [80, 100] },
  },
  { timestamps: true },
);
budgetSchema.index({ userId: 1, categoryId: 1 }, { unique: true });

const notificationSchema = schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ["budget-warning", "budget-exceeded", "split", "system"], required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    link: { type: String, default: "" },
    key: { type: String, required: true }, // dedupe: one alert per budget, period and threshold
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, key: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

const memberSchema = schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, default: "", lowercase: true, trim: true },
  isMe: { type: Boolean, default: false },
});

const settlementSchema = schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, default: () => new Date() },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

const groupSchema = schema(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    currency: { type: String, default: "INR" },
    members: { type: [memberSchema], default: [] },
    settlements: { type: [settlementSchema], default: [] },
  },
  { timestamps: true },
);

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDoc extends Timestamps {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  currency: string;
  timezone: string;
  tzOffset: number;
  monthStartDay: number;
  onboarded: boolean;
  isDemo: boolean;
  notificationPrefs: { inApp: boolean; email: boolean; push: boolean };
}

export interface CategoryDoc extends Timestamps {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  icon: string;
  color: string;
  keywords: string[];
  isDefault: boolean;
  archived: boolean;
}

export interface SplitShare {
  memberId: string;
  name?: string;
  amount: number;
}

export interface ExpenseDoc extends Timestamps {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  myShare: number;
  currency: string;
  categoryId: Types.ObjectId;
  merchant: string;
  note: string;
  occurredAt: Date;
  paymentMethod: "UPI" | "Cash" | "Card" | "Other" | null;
  source: "text" | "voice" | "receipt" | "manual" | "import" | "demo";
  receiptId: Types.ObjectId | null;
  split: { groupId: Types.ObjectId | null; paidBy: string; method: "equal" | "exact" | "percent"; shares: SplitShare[] } | null;
  aiMeta?: { rawInput?: string; parser?: string; confidence?: unknown; original?: unknown; edited?: string[] } | null;
}

export interface ReceiptDoc extends Timestamps {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  filePath?: string;
  data?: Buffer;
  mimeType?: string;
  size?: number;
  sha256: string;
  ocrText: string;
  extracted?: import("@/lib/parser").ParseResult | null;
  status: "scanned" | "failed" | "unsupported";
  expenseId: Types.ObjectId | null;
}

export interface RuleDoc extends Timestamps {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  match: string;
  categoryId: Types.ObjectId;
  hits: number;
}

export interface BudgetDoc extends Timestamps {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  categoryId: Types.ObjectId | null;
  limit: number;
  alertAt: number[];
}

export interface NotificationDoc extends Timestamps {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: "budget-warning" | "budget-exceeded" | "split" | "system";
  title: string;
  body: string;
  link: string;
  key: string;
  readAt: Date | null;
}

export interface MemberDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  isMe: boolean;
}

export interface SettlementDoc extends Timestamps {
  _id: Types.ObjectId;
  from: string;
  to: string;
  amount: number;
  date: Date;
  note: string;
}

export interface GroupDoc extends Timestamps {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  currency: string;
  members: MemberDoc[];
  settlements: SettlementDoc[];
}

export const User = (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>("User", userSchema);
export const Category = (mongoose.models.Category as Model<CategoryDoc>) ?? mongoose.model<CategoryDoc>("Category", categorySchema);
export const Expense = (mongoose.models.Expense as Model<ExpenseDoc>) ?? mongoose.model<ExpenseDoc>("Expense", expenseSchema);
export const Receipt = (mongoose.models.Receipt as Model<ReceiptDoc>) ?? mongoose.model<ReceiptDoc>("Receipt", receiptSchema);
export const CategoryRule = (mongoose.models.CategoryRule as Model<RuleDoc>) ?? mongoose.model<RuleDoc>("CategoryRule", ruleSchema);
export const Budget = (mongoose.models.Budget as Model<BudgetDoc>) ?? mongoose.model<BudgetDoc>("Budget", budgetSchema);
export const Notification = (mongoose.models.Notification as Model<NotificationDoc>) ?? mongoose.model<NotificationDoc>("Notification", notificationSchema);
export const Group = (mongoose.models.Group as Model<GroupDoc>) ?? mongoose.model<GroupDoc>("Group", groupSchema);
