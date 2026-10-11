import "server-only";
import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env";

// Reuse one connection across hot reloads and route invocations.
const globalForMongoose = globalThis as unknown as { mongooseConn?: Promise<typeof mongoose> };

const FALLBACK_DNS = ["8.8.8.8", "1.1.1.1"];

function isSrvLookupError(err: unknown) {
  const e = err as { syscall?: string; code?: string };
  return e?.syscall === "querySrv" || (e?.code === "ECONNREFUSED" && String(err).includes("querySrv"));
}

async function connect() {
  mongoose.set("strictQuery", true);
  if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()));
  const opts = { dbName: env.mongoDb, serverSelectionTimeoutMS: 10000 };
  try {
    return await mongoose.connect(env.mongoUri, opts);
  } catch (err) {
    // mongodb+srv:// needs a DNS SRV lookup. Some local resolvers refuse those;
    // retry once through public DNS before giving up.
    if (env.mongoUri.startsWith("mongodb+srv://") && isSrvLookupError(err)) {
      console.warn(`[db] SRV lookup failed with ${dns.getServers().join(", ")}; retrying with ${FALLBACK_DNS.join(", ")}`);
      dns.setServers(FALLBACK_DNS);
      return await mongoose.connect(env.mongoUri, opts);
    }
    throw err;
  }
}

export function connectDb(): Promise<typeof mongoose> {
  if (!globalForMongoose.mongooseConn) {
    globalForMongoose.mongooseConn = connect().catch((err) => {
      globalForMongoose.mongooseConn = undefined;
      throw err;
    });
  }
  return globalForMongoose.mongooseConn;
}
