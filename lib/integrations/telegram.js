
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

  if (/gagal|error|tidak dapat|salah/.test(value)) return "⚠️";
  if (/reset|admin|verifikasi/.test(value)) return "🛡️";
  if (/konfirmasi|rancangan/.test(value)) return "🔎";
  if (/statistik/.test(value)) return "📊";
  if (/agenda/.test(value)) return "🗓️";
  if (/pengingat|reminder/.test(value)) return "⏰";
  if (/kategori/.test(value)) return "🏷️";
  if (/tugas/.test(value)) return "📝";
  if (/penghapusan|dihapus/.test(value)) return "🗑️";
  if (/berhasil|selesai|dibuat|diperbarui|dipasang|dilepas/.test(value)) return "✅";
  if (/belum ada|tidak ditemukan|tidak ada/.test(value)) return "📭";
  if (/format|gunakan|contoh|perintah/.test(value)) return "ℹ️";
  if (/selamat datang/.test(value)) return "👋";
  if (/taskpilot commands/.test(value)) return "📚";

  return "🤖";
}

function getLineIcon(line, context) {
  const value = line.trim().toLowerCase();

  if (!value) return "";
  if (/^[\p{Extended_Pictographic}]/u.test(value)) return "";
  if (/^(ya|iya|setuju|konfirmasi|oke|ok|gas|reset|batal|cancel)\b/.test(value)) return "💬";
  if (/^(\d+[\.)])/.test(value)) return "🔹";
  if (/^(judul|nama|tugas|pengingat)\s*:/.test(value)) return "📌";
  if (/^(id|task id|reminder id)\s*:/.test(value)) return "🆔";
  if (/^(deadline|waktu|jadwal|tanggal|jam)\s*:/.test(value)) return "🗓️";
  if (/^prioritas\s*:/.test(value)) return "🔥";
  if (/^status\s*:/.test(value)) return "🔄";
  if (/^kategori\s*:/.test(value)) return "🏷️";
  if (/^(total|pending|in progress|completed|cancelled|processing|sent|failed)\s*:/.test(value)) return "📊";
  if (/^(target|jumlah)\s*:/.test(value)) return "🎯";
  if (/^(riwayat aktivitas|penggunaan ai|pengaturan|aksi tertunda)\s*:/.test(value)) return "📂";
  if (/^(deskripsi)\s*:/.test(value)) return "📄";
  if (/^konfirmasi/.test(value)) return "❔";
  if (/^kirim\b/.test(value)) return "💬";
  if (/^dan \d+/.test(value)) return "➕";

  if (context.includes("pengingat")) return "🔔";
  if (context.includes("kategori")) return "🏷️";
  if (context.includes("statistik")) return "📈";
  if (context.includes("reset")) return "🛡️";
  if (context.includes("tugas") || context.includes("agenda")) return "📌";

  return "";
}

function formatBodyLine(line, context) {
  const trimmed = line.trim();

  if (!trimmed) return "";

  const icon = getLineIcon(trimmed, context);

  const labelMatch = trimmed.match(/^([^:]{1,40}:)(.*)$/);

  if (labelMatch) {
    const label = escapeHtml(labelMatch[1]);
    const value = escapeHtml(labelMatch[2]);

    return `${icon ? `${icon} ` : ""}<b>${label}</b>${value}`;
  }

  return `${icon ? `${icon} ` : ""}${escapeHtml(trimmed)}`;
}

function formatMessage(text) {
  const content = String(text || "").trim();

  if (!content) return "";

  const lines = content.split("\n");
  const firstLine = lines.shift().trim();

  const icon = getMessageIcon(firstLine);
  const header = /^[\p{Extended_Pictographic}]/u.test(firstLine)
    ? `<b>${escapeHtml(firstLine)}</b>`
    : `${icon} <b>${escapeHtml(firstLine.toLocaleUpperCase("id-ID"))}</b>`;

  const body = lines
    .map(line => formatBodyLine(line, firstLine.toLowerCase()))
    .join("\n")
    .trim();

  return body
    ? `${header}\n━━━━━━━━━━━━━━\n${body}`
    : header;
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
