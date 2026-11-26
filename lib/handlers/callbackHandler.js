
import { config } from "../config/env.js";
import { sendMessage } from "../integrations/telegram.js";

export async function handleTelegramUpdate(update) {
  const message = update.message;

  if (!message?.from?.id || !message?.chat?.id) {
    return;
  }

  if (String(message.from.id) !== config.ownerTelegramId) {
    return;
  }

  const text = message.text?.trim();

  if (!text) {
    return;
  }

  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();

  if (command === "/start") {
    await sendMessage(
      message.chat.id,
      "Selamat datang di TaskPilot!\n\nPlan smarter. Stay focused. Get things done.\n\nBot berhasil terhubung. Fitur berikutnya sedang dipersiapkan."
    );
    return;
  }

  await sendMessage(
    message.chat.id,
    "Perintah belum tersedia. Silakan gunakan /start."
  );
}
