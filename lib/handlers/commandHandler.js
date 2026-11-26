
import { config } from "../config/env.js";
import { supabase } from "../integrations/supabase.js";
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

  if (command === "/dbtest") {
    try {
      const { error } = await supabase
        .from("tasks")
        .select("*")
        .limit(1);

      if (error) {
        throw error;
      }

      await sendMessage(
        message.chat.id,
        "Koneksi Supabase berhasil!\n\nDatabase: Connected\nTabel tasks: Accessible"
      );
    } catch (error) {
      console.error("Supabase connection test failed:", error.message);

      await sendMessage(
        message.chat.id,
        "Koneksi Supabase gagal. Silakan periksa konfigurasi database."
      );
    }

    return;
  }

  await sendMessage(
    message.chat.id,
    "Perintah belum tersedia. Silakan gunakan /start."
  );
}
