import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // These packages read their own data files at runtime (fonts, OCR workers),
  // so they must stay in node_modules instead of being bundled.
  serverExternalPackages: ["pdfkit", "exceljs", "tesseract.js", "mongoose"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
