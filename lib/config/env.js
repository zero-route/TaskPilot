
const requiredVariables = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "OWNER_TELEGRAM_ID",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET"
];

for (const variable of requiredVariables) {
  if (!process.env[variable]?.trim()) {
    throw new Error(`Missing environment variable: ${variable}`);
  }
}

const supabaseUrl = process.env.SUPABASE_URL.trim();
const ownerTelegramId = process.env.OWNER_TELEGRAM_ID.trim();

if (!/^https:\/\/.+/.test(supabaseUrl)) {
  throw new Error("Invalid SUPABASE_URL");
}

if (!/^\d+$/.test(ownerTelegramId)) {
  throw new Error("Invalid OWNER_TELEGRAM_ID");
}

export const config = Object.freeze({
  supabaseUrl,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY.trim(),
  ownerTelegramId,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN.trim(),
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET.trim()
});
