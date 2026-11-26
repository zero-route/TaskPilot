
import { timingSafeEqual } from "node:crypto";
import { config } from "../lib/config/env.js";

function verifyAdminKey(receivedKey) {
  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey || typeof receivedKey !== "string") {
    return false;
  }

  const expected = Buffer.from(expectedKey);
  const received = Buffer.from(receivedKey);

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!verifyAdminKey(req.headers["x-admin-key"])) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: "https://taskpilot-puce.vercel.app/api/telegram",
          secret_token: config.telegramWebhookSecret,
          allowed_updates: ["message", "callback_query"]
        })
      }
    );

    const result = await response.json();

    return res.status(response.ok ? 200 : 502).json({
      ok: result.ok,
      result: result.result ?? null,
      description: result.description ?? null
    });
  } catch {
    return res.status(502).json({
      ok: false,
      error: "Telegram API request failed"
    });
  }
}
