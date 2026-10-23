import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // These packages read their own data files at runtime (fonts, OCR workers),
  // so they must stay in node_modules instead of being bundled.
  serverExternalPackages: ["pdfkit", "exceljs", "tesseract.js", "mongoose", "unpdf", "@napi-rs/canvas"],
  // tesseract.js starts its worker and loads its wasm core by computed paths the tracer can't follow.
  outputFileTracingIncludes: {
    "/api/receipts": ["./node_modules/tesseract.js/src/**/*", "./node_modules/tesseract.js-core/*.{js,wasm}"],
  },
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
