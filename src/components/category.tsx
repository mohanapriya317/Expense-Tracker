"use client";

import {
  Baby,
  Briefcase,
  Bus,
  Car,
  CircleEllipsis,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./ui";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  "shopping-cart": ShoppingCart,
  fuel: Fuel,
  car: Car,
  "shopping-bag": ShoppingBag,
  receipt: Receipt,
  home: House,
  "heart-pulse": HeartPulse,
  clapperboard: Clapperboard,
  "graduation-cap": GraduationCap,
  plane: Plane,
  "circle-ellipsis": CircleEllipsis,
  gift: Gift,
  coffee: Coffee,
  dumbbell: Dumbbell,
  smartphone: Smartphone,
  zap: Zap,
  "paw-print": PawPrint,
  baby: Baby,
  briefcase: Briefcase,
  bus: Bus,
  shirt: Shirt,
  landmark: Landmark,
};

export function CategoryIcon({ icon, color, size = "md", className }: { icon?: string; color?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = CATEGORY_ICONS[icon ?? ""] ?? CircleEllipsis;
  const dims = { sm: "size-8", md: "size-10", lg: "size-12" }[size];
  const iconDims = { sm: "size-4", md: "size-[18px]", lg: "size-5" }[size];
  const c = color ?? "#94A3B8";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full", dims, className)} style={{ backgroundColor: `${c}1f`, color: c }} aria-hidden>
      <Icon className={iconDims} strokeWidth={2} />
    </span>
  );
}

export function CategoryChip({ name, color, icon, selected, onClick }: { name: string; color?: string; icon?: string; selected?: boolean; onClick?: () => void }) {
  const Icon = CATEGORY_ICONS[icon ?? ""] ?? CircleEllipsis;
  const content = (
    <>
      <Icon className="size-3.5" style={{ color: color }} aria-hidden />
      {name}
    </>
  );
  const cls = cn(
    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
    selected ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-fg hover:bg-surface-muted",
  );
  if (!onClick) return <span className={cls}>{content}</span>;
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={cls}>
      {content}
    </button>
  );
}
