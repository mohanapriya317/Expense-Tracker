import "server-only";
import { Types } from "mongoose";
import { currentMonthKey, periodRange, shiftMonth } from "@/lib/period";
import { hashPassword } from "../auth";
import { Budget, Category, CategoryRule, Expense, Group, Notification, Receipt, User, type CategoryDoc, type UserDoc } from "../models";
import { ensureDefaultCategories } from "./categories";
import { checkBudgetAlerts } from "./budgets";

export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "demo12345";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Template {
  cat: string;
  merchant: string;
  note: string;
  min: number;
  max: number;
  perMonth: number;
  source: "text" | "voice" | "receipt" | "manual";
  pay: "UPI" | "Cash" | "Card";
}

const TEMPLATES: Template[] = [
  { cat: "Food", merchant: "Swiggy", note: "Dinner", min: 250, max: 650, perMonth: 6, source: "receipt", pay: "UPI" },
  { cat: "Food", merchant: "Zomato", note: "Lunch", min: 200, max: 450, perMonth: 4, source: "text", pay: "UPI" },
  { cat: "Food", merchant: "", note: "Chai and snacks", min: 20, max: 120, perMonth: 10, source: "voice", pay: "Cash" },
  { cat: "Food", merchant: "Starbucks", note: "Coffee", min: 280, max: 420, perMonth: 2, source: "text", pay: "Card" },
  { cat: "Groceries", merchant: "BigBasket", note: "Weekly groceries", min: 600, max: 1800, perMonth: 4, source: "receipt", pay: "UPI" },
  { cat: "Groceries", merchant: "", note: "Milk and vegetables", min: 60, max: 240, perMonth: 6, source: "voice", pay: "Cash" },
  { cat: "Fuel", merchant: "Shell", note: "Petrol", min: 200, max: 1500, perMonth: 4, source: "voice", pay: "UPI" },
  { cat: "Fuel", merchant: "HP", note: "Petrol", min: 100, max: 800, perMonth: 2, source: "text", pay: "Cash" },
  { cat: "Transport", merchant: "Uber", note: "Cab", min: 150, max: 480, perMonth: 4, source: "receipt", pay: "UPI" },
  { cat: "Transport", merchant: "", note: "Metro card top-up", min: 100, max: 300, perMonth: 2, source: "text", pay: "UPI" },
  { cat: "Shopping", merchant: "Amazon", note: "Household items", min: 400, max: 2500, perMonth: 2, source: "receipt", pay: "Card" },
  { cat: "Shopping", merchant: "Myntra", note: "Clothes", min: 800, max: 2200, perMonth: 1, source: "receipt", pay: "Card" },
  { cat: "Entertainment", merchant: "BookMyShow", note: "Movie", min: 300, max: 800, perMonth: 1, source: "text", pay: "UPI" },
  { cat: "Entertainment", merchant: "Netflix", note: "Subscription", min: 649, max: 649, perMonth: 1, source: "manual", pay: "Card" },
  { cat: "Health", merchant: "Apollo", note: "Medicines", min: 150, max: 900, perMonth: 1, source: "receipt", pay: "UPI" },
];

const FIXED = [
  { cat: "Rent", merchant: "", note: "Rent", amount: 12000, day: 2, pay: "UPI" as const },
  { cat: "Bills", merchant: "Tata Power", note: "Electricity bill", amount: 1860, day: 8, pay: "UPI" as const },
  { cat: "Bills", merchant: "Airtel", note: "Broadband", amount: 799, day: 5, pay: "Card" as const },
  { cat: "Bills", merchant: "Jio", note: "Mobile recharge", amount: 349, day: 12, pay: "UPI" as const },
];

/** Creates (or rebuilds) the demo account with about 3 months of realistic data. */
export async function resetDemoUser(tzOffset = 330): Promise<UserDoc> {
  let user = await User.findOne({ email: DEMO_EMAIL }).lean<UserDoc>();
  if (user) {
    const userId = user._id;
    await Promise.all([
      Expense.deleteMany({ userId }),
      Category.deleteMany({ userId }),
      CategoryRule.deleteMany({ userId }),
      Budget.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
      Receipt.deleteMany({ userId }),
      Group.deleteMany({ ownerId: userId }),
    ]);
    await User.updateOne({ _id: userId }, { $set: { tzOffset, onboarded: true, monthStartDay: 1, currency: "INR" } });
  } else {
    const created = await User.create({
      email: DEMO_EMAIL,
      name: "Priya",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      isDemo: true,
      onboarded: true,
      tzOffset,
    });
    user = created.toObject() as UserDoc;
  }
  user = (await User.findById(user._id).lean<UserDoc>())!;
  const userId = user._id;

  await ensureDefaultCategories(userId);
  const cats = await Category.find({ userId }).lean<CategoryDoc[]>();
  const cat = (name: string) => cats.find((c) => c.name === name)!._id;

  const rand = rng(42);
  const now = new Date();
  const curKey = currentMonthKey(user, now);
  const docs: Record<string, unknown>[] = [];
  const DAY = 86_400_000;

  for (let back = 3; back >= 0; back--) {
    const key = shiftMonth(curKey, -back);
    const range = periodRange(key, user);
    const lastDay = back === 0 ? Math.floor((now.getTime() - range.start.getTime()) / DAY) : range.days - 1;
    if (lastDay < 0) continue;
    // Spending grows a little each month so trends and alerts have something to show.
    const growth = 1 + (3 - back) * 0.03;

    for (const f of FIXED) {
      if (f.day - 1 > lastDay) continue;
      docs.push({
        userId, amount: f.amount * 100, myShare: f.amount * 100, currency: "INR", categoryId: cat(f.cat), merchant: f.merchant, note: f.note,
        occurredAt: new Date(range.start.getTime() + (f.day - 1) * DAY + 10 * 3600_000), paymentMethod: f.pay, source: "manual",
      });
    }
    for (const t of TEMPLATES) {
      const count = Math.max(0, Math.round(t.perMonth * growth * ((lastDay + 1) / range.days) * (0.8 + rand() * 0.4)));
      for (let i = 0; i < count; i++) {
        const day = Math.floor(rand() * (lastDay + 1));
        const hour = 8 + Math.floor(rand() * 14);
        let when = range.start.getTime() + day * DAY + hour * 3600_000 + Math.floor(rand() * 60) * 60_000;
        if (when > now.getTime()) when = now.getTime() - Math.floor(rand() * 3 * 3600_000);
        const amount = Math.round((t.min + rand() * (t.max - t.min)) * growth);
        docs.push({
          userId, amount: amount * 100, myShare: amount * 100, currency: "INR", categoryId: cat(t.cat), merchant: t.merchant, note: t.note,
          occurredAt: new Date(when), paymentMethod: t.pay, source: t.source,
          aiMeta: t.source === "manual" ? undefined : { rawInput: `${t.note.toLowerCase()} ${amount}`, parser: "rules-v1", confidence: { amount: "high", category: "high" } },
        });
      }
    }
  }

  // A flatmates group with shared costs.
  const meId = new Types.ObjectId();
  const raviId = new Types.ObjectId();
  const anuId = new Types.ObjectId();
  const group = await Group.create({
    ownerId: userId,
    name: "Flatmates",
    members: [
      { _id: meId, name: "You", isMe: true },
      { _id: raviId, name: "Ravi", email: "" },
      { _id: anuId, name: "Anu", email: "" },
    ],
    settlements: [{ from: String(anuId), to: String(meId), amount: 50000, date: new Date(now.getTime() - 9 * DAY), note: "UPI" }],
  });
  const shared = [
    { note: "Groceries for the flat", merchant: "DMart", total: 2400, paidBy: meId, daysAgo: 12, cat: "Groceries" },
    { note: "Dinner out", merchant: "Barbeque Nation", total: 3300, paidBy: raviId, daysAgo: 6, cat: "Food" },
    { note: "Wifi bill", merchant: "Airtel", total: 1200, paidBy: meId, daysAgo: 3, cat: "Bills" },
  ];
  for (const s of shared) {
    const each = Math.floor((s.total * 100) / 3);
    const rem = s.total * 100 - each * 3;
    const shares = [meId, raviId, anuId].map((id) => ({ memberId: String(id), name: id === meId ? "You" : id === raviId ? "Ravi" : "Anu", amount: each + (String(id) === String(s.paidBy) ? rem : 0) }));
    docs.push({
      userId, amount: s.total * 100, myShare: shares[0].amount, currency: "INR", categoryId: cat(s.cat), merchant: s.merchant, note: s.note,
      occurredAt: new Date(now.getTime() - s.daysAgo * DAY), paymentMethod: "UPI", source: "text",
      split: { groupId: group._id, paidBy: String(s.paidBy), method: "equal", shares },
    });
  }

  // Insert through the driver so each expense's logged time matches when it happened
  // (Mongoose would stamp every seeded row with "now").
  await Expense.collection.insertMany(
    docs.map((d) => ({ receiptId: null, split: null, ...d, createdAt: d.occurredAt as Date, updatedAt: d.occurredAt as Date })),
  );
  await Budget.insertMany([
    { userId, categoryId: null, limit: 45000 * 100 },
    { userId, categoryId: cat("Food"), limit: 8000 * 100 },
    { userId, categoryId: cat("Fuel"), limit: 7000 * 100 },
    { userId, categoryId: cat("Shopping"), limit: 4500 * 100 },
    { userId, categoryId: cat("Bills"), limit: 3000 * 100 },
    { userId, categoryId: cat("Groceries"), limit: 9000 * 100 },
  ]);
  await CategoryRule.create({ userId, match: "tata power", categoryId: cat("Bills"), hits: 3 });
  await checkBudgetAlerts(user, now);
  return user;
}
