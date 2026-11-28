
import { askAI } from "../integrations/cloudflare.js";

function parseJson(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("AI menghasilkan respons yang tidak valid.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function normalizeTime(value) {
  if (typeof value !== "string") return value;

  const input = value.trim().toLowerCase();
  const match = input.match(/(?:jam|pukul)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|dini hari|siang|sore|malam)?/i);

  if (!match) return value;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3] || "";

  if (hour > 23 || minute > 59) return value;

  if (period === "siang" || period === "sore") {
    if (hour >= 1 && hour <= 11) hour += 12;
  } else if (period === "malam") {
    if (hour === 12) hour = 0;
    else if (hour >= 6 && hour <= 11) hour += 12;
  } else if (period === "pagi" || period === "dini hari") {
    if (hour === 12) hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeDate(value) {
  if (typeof value !== "string") return value;

  const input = value.trim();
  const match = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (!match) return input;

  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function isEmptyCategory(value) {
  if (value === null || value === undefined) return true;

  return [
    "",
    "tidak ada",
    "nggak ada",
    "enggak ada",
    "gak ada",
    "ga ada",
    "tanpa kategori",
    "kosong",
    "none",
    "null"
  ].includes(String(value).trim().toLowerCase());
}

function normalizeAction(action) {
  if (!action || typeof action !== "object") return action;

  const normalized = { ...action };

  if (normalized.date) {
    normalized.date = normalizeDate(normalized.date);
  }

  if (normalized.time) {
    normalized.time = normalizeTime(normalized.time);
  }

  if (isEmptyCategory(normalized.category_name)) {
    normalized.category_name = null;
  }

  if (isEmptyCategory(normalized.category_id)) {
    normalized.category_id = null;
  }

  if (normalized.updates && typeof normalized.updates === "object") {
    normalized.updates = { ...normalized.updates };

    if (normalized.updates.date) {
      normalized.updates.date = normalizeDate(normalized.updates.date);
    }

    if (normalized.updates.time) {
      normalized.updates.time = normalizeTime(normalized.updates.time);
    }

    if (isEmptyCategory(normalized.updates.category_name)) {
      normalized.updates.category_name = null;
    }

    if (isEmptyCategory(normalized.updates.category_id)) {
      normalized.updates.category_id = null;
    }
  }

  return normalized;
}

export async function createAIPlan(message, context) {
  const currentTime = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date());

  const prompt = `
Kamu adalah AI TaskPilot, asisten pribadi yang fleksibel untuk mengelola tugas, pengingat, dan kategori.

Waktu sekarang: ${currentTime} WITA.
Zona waktu: Asia/Makassar UTC+8.
Tanggal dan waktu tersebut adalah acuan utama untuk semua tanggal relatif.

Pahami bahasa Indonesia sehari-hari, bahasa informal, singkatan, typo, kalimat tidak lengkap, dan konteks data pengguna. Jangan mengharuskan format perintah tertentu.

Kembalikan JSON valid dengan struktur:
{
  "response": null,
  "actions": [
    {
      "type": "create_task | update_task | delete_task | complete_task | create_reminder | update_reminder | delete_reminder | create_category | update_category | delete_category | assign_category | remove_category | list_tasks | list_reminders | list_categories",
      "target_id": null,
      "title": null,
      "description": null,
      "priority": null,
      "date": null,
      "time": null,
      "category_name": null,
      "category_id": null,
      "status": null,
      "updates": {}
    }
  ]
}

DATA PENGGUNA:
${JSON.stringify(context)}

ATURAN:
- Satu pesan dapat berisi beberapa instruksi dan menghasilkan beberapa actions.
- Pahami hubungan antarobjek. Contoh: "masukkan tugas laporan ke kategori kerja" berarti cari tugas laporan dan kategori kerja, lalu gunakan assign_category.
- Pengguna dapat menyebut objek berdasarkan ID, judul, nama, atau konteks percakapan.
- Gunakan ID yang benar-benar tersedia dalam data. Jangan membuat ID.
- Jika target memiliki beberapa kemungkinan, tanyakan klarifikasi dan jangan membuat tindakan.
- Jika target tidak ditemukan, jelaskan apa yang tidak ditemukan.
- Jika pengguna hanya bertanya atau mengobrol, actions harus [] dan jawab secara alami melalui response.
- Untuk melihat data gunakan list_tasks, list_reminders, atau list_categories.
- Untuk membuat, mengedit, menghapus satu data, menyelesaikan tugas, mengelola kategori, gunakan action yang sesuai.
- Operasi biasa boleh digabungkan dalam satu permintaan.
- Jangan membuat tindakan penghapusan massal, reset, statistik administratif, atau pengaturan sistem.
- Jangan mengubah data sebelum konfirmasi aplikasi.

WAKTU:
- Selalu hitung tanggal relatif berdasarkan waktu sekarang WITA.
- "hari ini" berarti tanggal sekarang.
- "besok" berarti satu hari setelah tanggal sekarang.
- "lusa" berarti dua hari setelah tanggal sekarang.
- Pahami nama hari dan tanggal kalender.
- Format tanggal keluaran wajib YYYY-MM-DD.
- Format waktu keluaran wajib HH:mm dalam 24 jam.
- "jam 3 dini hari" berarti 03:00.
- "jam 3 pagi" berarti 03:00.
- "jam 3 malam" berarti 03:00.
- "jam 9 malam" berarti 21:00.
- "jam 12 malam" berarti 00:00.
- "jam 3 siang" berarti 15:00.
- "jam 3 sore" berarti 15:00.
- "jam 6 sore" berarti 18:00.
- "jam 12 siang" berarti 12:00.
- Angka waktu dengan titik seperti 03.00 harus diubah menjadi 03:00.
- Jika jam disebut tanpa keterangan periode, gunakan konteks kalimat. Jika tetap ambigu, tanyakan.
- Jika tanggal disebut tanpa jam, gunakan 08:00 WITA.
- Jika jam tidak disebut, jangan mengarang jam selain aturan default 08:00 untuk tanggal yang memang disebut.
- Jika deadline tugas tidak disebut, biarkan date dan time null.
- Pengingat harus memiliki tanggal. Jika tanggal tidak disebut, tanyakan.
- Jangan mengubah waktu yang sudah disebut pengguna tanpa alasan.

KATEGORI:
- "nggak ada kategori", "tidak ada kategori", "tanpa kategori", "kosong", dan "none" berarti category_id dan category_name null.
- Jika pengguna meminta tugas tanpa kategori, buat tugas dengan category_id null.
- Jika kategori disebut berdasarkan nama, gunakan category_name.
- Jika kategori disebut berdasarkan ID, gunakan category_id.
- Jangan menganggap kategori yang tidak disebut sebagai kategori baru.

TUGAS:
- Prioritas yang didukung: low, medium, high, urgent.
- Pahami rendah sebagai low, sedang/normal sebagai medium, tinggi sebagai high, mendesak sebagai urgent.
- Status yang didukung: pending, in_progress, completed, cancelled.
- Pahami "selesai" sebagai complete_task.
- Pahami "hapus" sebagai delete_task.
- Pahami "pindahkan ke kategori" sebagai assign_category.
- Pahami "lepas kategori" sebagai remove_category.
- update_task menaruh semua perubahan di dalam updates.
- Field update_task yang boleh digunakan: title, description, priority, date, time, category_name, category_id.
- update_reminder menaruh perubahan di dalam updates.
- Field update_reminder yang boleh digunakan: title, date, time.

PENGINGAT:
- Buat pengingat dengan create_reminder.
- Ubah pengingat dengan update_reminder.
- Hapus satu pengingat dengan delete_reminder.
- Pengingat tanpa jam menggunakan 08:00 WITA.

KONTEKS DAN KLARIFIKASI:
- Jika pengguna melanjutkan pembicaraan sebelumnya, gunakan konteks data yang tersedia.
- Jangan meminta ID jika judul sudah cukup untuk menemukan satu target yang unik.
- Jika pengguna menyebut "yang tadi", cari berdasarkan konteks pesan dan data.
- Jika informasi penting belum tersedia, tanyakan hanya informasi yang kurang.
- Jangan menolak permintaan yang sebenarnya bisa dipahami.
- Jangan mengarang tanggal, jam, judul, ID, atau data.
- response harus berbahasa Indonesia.
- Jika actions berisi tindakan, response boleh null.
- Jika perlu klarifikasi, actions harus [] dan response harus berupa pertanyaan singkat.

PESAN PENGGUNA:
${message}

Kembalikan JSON saja.
`;

  const result = await askAI(prompt);
  const parsed = parseJson(result);

  if (!Array.isArray(parsed.actions)) {
    throw new Error("AI menghasilkan rencana tindakan yang tidak valid.");
  }

  return {
    response: typeof parsed.response === "string" ? parsed.response : null,
    actions: parsed.actions.map(normalizeAction)
  };
}
