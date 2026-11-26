
import { timingSafeEqual } from "node:crypto";
import { config } from "../lib/config/env.js";
import { handleTelegramUpdate } from "../lib/handlers/commandHandler.js";

function verifyWebhookSecret(receivedSecret) {
  if (typeof receivedSecret !== "string") {
    return false;
  }

  const expected = Buffer.from(config.telegramWebhookSecret);
  const received = Buffer.from(receivedSecret);

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-telegram-bot-api-secret-token"];

  if (!verifyWebhookSecret(secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await handleTelegramUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch {
    console.error("Telegram webhook processing failed");
    return res.status(500).json({ error: "Internal server error" });
  }
}
