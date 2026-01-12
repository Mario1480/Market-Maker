type AlertLevel = "info" | "warn" | "error";

const DEDUPE_SECONDS = Number(process.env.ALERT_DEDUPE_SECONDS ?? "120");
const recent = new Map<string, number>();
const CACHE_MS = 30_000;
let cachedCfg: { token?: string | null; chatId?: string | null; ts: number } | null = null;

function dedupeKey(level: AlertLevel, title: string, body?: string) {
  return `${level}:${title}:${body ?? ""}`.slice(0, 500);
}

function shouldSend(level: AlertLevel, title: string, body?: string) {
  const k = dedupeKey(level, title, body);
  const now = Date.now();
  const last = recent.get(k) ?? 0;
  if (now - last < DEDUPE_SECONDS * 1000) return false;
  recent.set(k, now);
  return true;
}

async function loadTelegramConfig() {
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  const envChat = process.env.TELEGRAM_CHAT_ID;
  if (envToken && envChat) return { token: envToken, chatId: envChat };

  const now = Date.now();
  if (cachedCfg && now - cachedCfg.ts < CACHE_MS) {
    return { token: cachedCfg.token, chatId: cachedCfg.chatId };
  }

  try {
    const { prisma } = await import("@mm/db");
    const cfg = await prisma.alertConfig.findUnique({ where: { key: "default" } });
    cachedCfg = { token: cfg?.telegramBotToken ?? null, chatId: cfg?.telegramChatId ?? null, ts: now };
    return { token: cachedCfg.token, chatId: cachedCfg.chatId };
  } catch {
    return { token: null, chatId: null };
  }
}

async function sendTelegram(text: string) {
  const { token, chatId } = await loadTelegramConfig();
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });
}

export async function alert(level: AlertLevel, title: string, body?: string) {
  if (!shouldSend(level, title, body)) return;
  const text = body ? `${title}\n${body}` : title;
  try {
    await sendTelegram(text);
  } catch {
    // Best-effort only.
  }
}
