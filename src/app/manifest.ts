import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Expense Tracker",
    short_name: "Expenses",
    description: "Log expenses by text, voice or receipt.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#4f46e5",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
