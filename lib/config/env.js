
const requiredVariables = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "OWNER_TELEGRAM_ID",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "ADMIN_KEY"
];

for (const variable of requiredVariables) {
  if (!process.env[variable]?.trim()) {
    throw new Error(`Missing environment variable: ${variable}`);
  }
}

const supabaseUrl = process.env.SUPABASE_URL.trim();
const ownerTelegramId = process.env.OWNER_TELEGRAM_ID.trim();
const cloudflareWorkerUrl = process.env.CLOUDFLARE_WORKER_URL?.trim() || "";
const cloudflareProxySecret = process.env.CLOUDFLARE_PROXY_SECRET?.trim() || "";

if (!/^https:\/\/.+/.test(supabaseUrl)) {
  throw new Error("Invalid SUPABASE_URL");
}

if (!/^\d+$/.test(ownerTelegramId)) {
  throw new Error("Invalid OWNER_TELEGRAM_ID");
}

if (cloudflareWorkerUrl && !/^https:\/\/.+/.test(cloudflareWorkerUrl)) {
  throw new Error("Invalid CLOUDFLARE_WORKER_URL");
}

export const config = Object.freeze({
  supabaseUrl,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY.trim(),
  ownerTelegramId,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN.trim(),
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET.trim(),
  cloudflareWorkerUrl,
  cloudflareProxySecret,
  adminKey: process.env.ADMIN_KEY.trim()
});
