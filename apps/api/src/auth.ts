import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "@mm/db";

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? "30");
const REAUTH_TTL_MIN = Number(process.env.REAUTH_TTL_MIN ?? "10");
const SESSION_COOKIE = "mm_session";
const REAUTH_COOKIE = "mm_reauth";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeMs,
    path: "/"
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt
    }
  });

  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_DAYS * 24 * 60 * 60 * 1000));
  return { expiresAt };
}

export async function destroySession(res: Response, token?: string | null) {
  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(token) }
    });
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(REAUTH_COOKIE, { path: "/" });
}

export async function createReauth(res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + REAUTH_TTL_MIN * 60 * 1000);

  await prisma.reauthSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt
    }
  });

  res.cookie(REAUTH_COOKIE, token, cookieOptions(REAUTH_TTL_MIN * 60 * 1000));
  return { expiresAt };
}

async function ensureWorkspaceForUser(userId: string) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true }
  });
  if (membership) return membership.workspace;

  const workspace = await prisma.workspace.create({
    data: {
      name: "Default",
      members: {
        create: { userId, role: "owner" }
      }
    }
  });

  await prisma.bot.updateMany({
    where: { workspaceId: null },
    data: { workspaceId: workspace.id }
  });

  return workspace;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true }
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    await destroySession(res, token);
    return res.status(401).json({ error: "unauthorized" });
  }

  const now = Date.now();
  if (session.user.autoLogoutEnabled) {
    const idleMs = session.user.autoLogoutMinutes * 60 * 1000;
    const lastActiveAt = session.lastActiveAt?.getTime?.() ?? session.createdAt.getTime();
    if (now - lastActiveAt > idleMs) {
      await destroySession(res, token);
      return res.status(401).json({ error: "session_expired" });
    }
  }

  if (now - session.lastActiveAt.getTime() > 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date(now) }
    });
  }

  const workspace = await ensureWorkspaceForUser(session.userId);
  res.locals.user = session.user;
  res.locals.workspaceId = workspace.id;
  next();
}

export async function requireReauth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[REAUTH_COOKIE];
  if (!token) return res.status(403).json({ error: "reauth_required" });

  const session = await prisma.reauthSession.findUnique({
    where: { tokenHash: hashToken(token) }
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    res.clearCookie(REAUTH_COOKIE, { path: "/" });
    return res.status(403).json({ error: "reauth_required" });
  }

  if (res.locals.user?.id && session.userId !== res.locals.user.id) {
    return res.status(403).json({ error: "reauth_required" });
  }

  next();
}

export function getUserFromLocals(res: Response) {
  return res.locals.user as { id: string; email: string };
}

export function getWorkspaceId(res: Response) {
  return res.locals.workspaceId as string;
}
