import bcrypt from "bcryptjs";
import { prisma } from "@mm/db";

export async function seedAdmin() {
  const enabled = (process.env.ADMIN_CREATE ?? "true").toLowerCase() !== "false";
  if (!enabled) return { seeded: false, reason: "disabled" };

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const workspaceName = process.env.ADMIN_WORKSPACE_NAME ?? "Main";
  if (!email || !password) {
    console.warn("[seed] ADMIN_EMAIL/ADMIN_PASSWORD missing, skip admin seed.");
    return { seeded: false, reason: "missing_env" };
  }

  const count = await prisma.user.count();
  if (count > 0) return { seeded: false, reason: "users_exist" };

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash }
  });
  const workspace = await prisma.workspace.create({
    data: { name: workspaceName }
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "owner" }
  });

  await prisma.bot.updateMany({
    where: { workspaceId: null },
    data: { workspaceId: workspace.id }
  });

  console.log(`[seed] admin user created: ${email} (workspace ${workspaceName})`);
  return { seeded: true };
}
