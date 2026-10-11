// Money is stored as integer minor units (paise for INR) to avoid float rounding.

export const CURRENCIES: Record<string, { symbol: string; locale: string }> = {
  INR: { symbol: "₹", locale: "en-IN" },
  USD: { symbol: "$", locale: "en-US" },
  EUR: { symbol: "€", locale: "de-DE" },
  GBP: { symbol: "£", locale: "en-GB" },
};

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function formatMoney(minor: number, currency = "INR", opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const meta = CURRENCIES[currency] ?? CURRENCIES.INR;
  const value = fromMinor(minor);
  if (opts.compact && Math.abs(value) >= 1000) {
    const k = value / 1000;
    return `${meta.symbol}${k.toFixed(k >= 100 ? 0 : 1)}k`;
  }
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  return (
    (value < 0 ? "-" : "") +
    meta.symbol +
    Math.abs(value).toLocaleString(meta.locale, {
      minimumFractionDigits: opts.decimals || hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

export function currencySymbol(currency = "INR"): string {
  return (CURRENCIES[currency] ?? CURRENCIES.INR).symbol;
}
