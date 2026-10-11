import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export const env = {
  get mongoUri() {
    return required("MONGODB_URI");
  },
  get mongoDb() {
    return process.env.MONGODB_DB || "expense_tracker";
  },
  get authSecret() {
    return new TextEncoder().encode(required("AUTH_SECRET"));
  },
  get allowDemo() {
    return process.env.ALLOW_DEMO === "true";
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR || "./uploads";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};
