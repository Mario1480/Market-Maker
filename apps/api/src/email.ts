import nodemailer from "nodemailer";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "0");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const secure = (process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || port === 465;

  if (!host || !port || !user || !pass || !from) return null;
  return { host, port, user, pass, from, secure };
}

export async function sendInviteEmail(params: {
  to: string;
  workspaceName: string;
  invitedByEmail: string;
  tempPassword?: string | null;
  baseUrl: string;
}) {
  const cfg = getSmtpConfig();
  if (!cfg) return { ok: false, error: "smtp_not_configured" };

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass }
  });

  const loginUrl = `${params.baseUrl.replace(/\/$/, "")}/login`;
  const lines = [
    `You have been invited to the workspace \"${params.workspaceName}\".`,
    `Invited by: ${params.invitedByEmail}`,
    "",
    `Login: ${loginUrl}`
  ];

  if (params.tempPassword) {
    lines.push("", `Temporary password: ${params.tempPassword}`, "Please change it after login.");
  }

  const text = lines.join("\n");

  try {
    await transporter.sendMail({
      from: cfg.from,
      to: params.to,
      subject: "Workspace invitation (uLiquid)",
      text
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) };
  }
}
