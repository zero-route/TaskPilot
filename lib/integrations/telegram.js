
import { config } from "../config/env.js";

const telegramApi = `https://api.telegram.org/bot${config.telegramBotToken}`;

export async function sendMessage(chatId, text) {
  const response = await fetch(`${telegramApi}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error("Telegram sendMessage failed");
  }

  return result;
}
