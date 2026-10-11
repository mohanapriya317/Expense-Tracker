import { describe, expect, it } from "vitest";
import { parseExpenseText, parseReceiptText } from "./parser";

const now = new Date(2026, 9, 11, 9, 12); // 11 Oct 2026, 09:12

describe("parseExpenseText", () => {
  it("parses the flowchart example", () => {
    const r = parseExpenseText("Petrol 200", { now });
    expect(r.amount).toBe(20000);
    expect(r.categoryName).toBe("Fuel");
    expect(r.confidence.amount).toBe("high");
  });

  it("reads merchant, date, payment and split", () => {
    const r = parseExpenseText("lunch 340 at Swiggy yesterday with Ravi and Anu via upi", { now });
    expect(r.amount).toBe(34000);
    expect(r.categoryName).toBe("Food");
    expect(r.merchant).toBe("Swiggy");
    expect(r.paymentMethod).toBe("UPI");
    expect(r.splitWith).toEqual(["Ravi", "Anu"]);
    expect(new Date(r.occurredAt!).getDate()).toBe(10);
  });

  it("understands spoken numbers", () => {
    expect(parseExpenseText("petrol hundred", { now }).amount).toBe(10000);
    expect(parseExpenseText("coffee two hundred fifty", { now }).amount).toBe(25000);
    expect(parseExpenseText("chai one fifty", { now }).amount).toBe(15000);
  });

  it("handles currency symbols, commas and k", () => {
    expect(parseExpenseText("rent ₹12,500", { now }).amount).toBe(1250000);
    expect(parseExpenseText("flight 4.5k", { now }).amount).toBe(450000);
    expect(parseExpenseText("Rs. 99.50 snacks", { now }).amount).toBe(9950);
  });

  it("does not read a date as the amount", () => {
    const r = parseExpenseText("groceries 640 on 5 oct", { now });
    expect(r.amount).toBe(64000);
    expect(new Date(r.occurredAt!).getMonth()).toBe(9);
    expect(new Date(r.occurredAt!).getDate()).toBe(5);
  });

  it("applies user rules before keywords", () => {
    const r = parseExpenseText("Shell 500", {
      now,
      rules: [{ match: "shell", categoryName: "Car" }],
      categories: [{ name: "Car" }, { name: "Fuel" }],
    });
    expect(r.categoryName).toBe("Car");
  });
});

describe("parseReceiptText", () => {
  it("prefers the grand total line", () => {
    const r = parseReceiptText(
      ["SWIGGY", "Order #1234", "10/10/2026 21:05", "Item total 480.00", "Taxes 24.00", "Delivery 36.00", "Grand Total ₹540.00", "Paid via UPI"].join("\n"),
      { now },
    );
    expect(r.amount).toBe(54000);
    expect(r.merchant).toBe("Swiggy");
    expect(r.categoryName).toBe("Food");
    expect(r.paymentMethod).toBe("UPI");
    const d = new Date(r.occurredAt!);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(21);
  });

  it("reads online payment screenshots", () => {
    const r = parseReceiptText("₹1,860\nPaid to Tata Power\n8 Oct 2026, 10:15 am\nUPI transaction ID 1234567890", { now });
    expect(r.amount).toBe(186000);
    expect(r.merchant).toBe("Tata Power");
  });
});
