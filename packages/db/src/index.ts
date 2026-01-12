import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prevent hot-reload creating many clients in dev
export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: ["error", "warn"]
  });

if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;

export * from "@prisma/client";