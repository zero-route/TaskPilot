
import { config } from "../config/env.js";

const telegramApi = `https://api.telegram.org/bot${config.telegramBotToken}`;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getMessageIcon(header) {
  const value = header.toLowerCase();

  if (/reset|admin|verifikasi/.test(value)) return "🛡️";
  if (/statistik/.test(value)) return "📊";
  if (/agenda/.test(value)) return "🗓️";
  if (/daftar tugas|tugas/.test(value)) return "📝";
  if (/pengingat|reminder/.test(value)) return "⏰";
  if (/kategori/.test(value)) return "🏷️";
  if (/konfirmasi|rancangan/.test(value)) return "🔎";
  if (/gagal|error|tidak dapat|salah/.test(value)) return "⚠️";
  if (/berhasil|selesai|dibuat|diperbarui|dihapus|dipasang|dilepas/.test(value)) return "✅";
  if (/belum ada|tidak ditemukan|tidak ada/.test(value)) return "📭";
  if (/format|gunakan|contoh|perintah/.test(value)) return "ℹ️";
  if (/selamat datang/.test(value)) return "👋";
  if (/taskpilot commands/.test(value)) return "📚";

  return "🤖";
}

function formatMessage(text) {
  const content = String(text || "").trim();

  if (!content) return "";

  const lines = content.split("\n");
  const firstLine = lines[0].trim();

  if (/^[\p{Extended_Pictographic}]/u.test(firstLine)) {
    return escapeHtml(content);
  }

  const icon = getMessageIcon(firstLine);
  const header = escapeHtml(firstLine.toLocaleUpperCase("id-ID"));
  const body = lines.slice(1).join("\n").trim();

  if (!body) {
    return `${icon} <b>${header}</b>`;
  }

  return `${icon} <b>${header}</b>\n━━━━━━━━━━━━━━\n${escapeHtml(body)}`;
}

export async function sendMessage(chatId, text) {
  const response = await fetch(`${telegramApi}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: formatMessage(text),
      parse_mode: "HTML"
    })
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error("Telegram sendMessage failed");
  }

  return result;
}
