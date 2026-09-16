import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Query logging is a development tool, not a production one.
 *
 * `log: ["query"]` unconditionally wrote every statement — parameters included
 * — to stdout on every request. In production that is a per-query serialization
 * cost, a log bill, and a standing risk of putting customer data in a log
 * aggregator that has a different retention policy from the database.
 *
 * Warnings and errors are kept everywhere, because those are the ones you need
 * at 3am.
 */
const log: ("query" | "warn" | "error")[] =
  process.env.NODE_ENV === "production" ? ["warn", "error"] : ["query", "warn", "error"];

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
