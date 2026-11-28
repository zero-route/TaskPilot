
import { askAI } from "../integrations/cloudflare.js";

const intents = [
  "create_task",
  "create_reminder",
  "list_tasks",
  "list_reminders",
  "update_task",
  "update_reminder",
  "unknown"
];

function parseJson(value) {
  const cleaned = value.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned);
}

export async function parseAIRequest(message) {
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
Kamu adalah AI Assistant TaskPilot, asisten pengelola tugas dan pengingat pribadi.

Waktu sekarang: ${currentTime} WITA.
Zona waktu: Asia/Makassar UTC+8.

Analisis pesan pengguna dan kembalikan JSON valid saja.

Schema:
{
  "intent": "create_task | create_reminder | list_tasks | list_reminders | update_task | update_reminder | unknown",
  "title": null,
  "description": null,
  "priority": "medium",
  "date": null,
  "time": null,
  "target": null,
  "updates": {},
  "response": null
}

Aturan:
- create_task untuk membuat tugas.
- create_reminder untuk membuat pengingat.
- list_tasks untuk melihat daftar tugas.
- list_reminders untuk melihat daftar pengingat.
- update_task untuk menyesuaikan tugas yang sudah ada.
- update_reminder untuk menyesuaikan pengingat yang sudah ada.
- unknown untuk permintaan yang tidak didukung.
- Jangan pernah memilih intent untuk menghapus atau menyelesaikan data.
- Jangan mengeksekusi tindakan. Hanya analisis.
- Untuk tanggal relatif seperti besok, lusa, atau hari Senin, hitung berdasarkan waktu sekarang.
- Format date adalah YYYY-MM-DD.
- Format time adalah HH:mm.
- Jika pengguna menyebut tanggal tanpa jam, isi time dengan null.
- Jika pengguna tidak menyebut tanggal, isi date dengan null.
- Jangan mengarang tanggal.
- Prioritas hanya low, medium, high, urgent.
- Prioritas default medium.
- Untuk update_task, target berisi nama atau ID tugas yang dimaksud.
- Untuk update_reminder, target berisi nama atau ID pengingat yang dimaksud.
- Untuk update_task, updates hanya boleh berisi title, description, priority, date, time.
- Untuk update_reminder, updates hanya boleh berisi title, date, time.
- Jangan memasukkan status ke updates.
- Jika pengguna meminta penyesuaian tetapi target atau perubahan tidak jelas, gunakan unknown dan minta penjelasan melalui response.
- Jika pengguna meminta menghapus atau menyelesaikan data, jelaskan bahwa perintah khusus TaskPilot harus digunakan.
- response harus berbahasa Indonesia.
- Jangan menambahkan Markdown.

Contoh:
Pesan: "Buat tugas belajar coding besok"
JSON: {"intent":"create_task","title":"Belajar coding","description":null,"priority":"medium","date":"tanggal besok sesuai waktu sekarang","time":null,"target":null,"updates":{},"response":null}

Pesan pengguna:
${message}
`;

  const result = await askAI(prompt);
  const parsed = parseJson(result);

  if (!intents.includes(parsed.intent)) {
    throw new Error("Invalid AI intent");
  }

  if (!["low", "medium", "high", "urgent"].includes(parsed.priority)) {
    parsed.priority = "medium";
  }

  if (!parsed.updates || typeof parsed.updates !== "object" || Array.isArray(parsed.updates)) {
    parsed.updates = {};
  }

  return {
    intent: parsed.intent,
    title: typeof parsed.title === "string" ? parsed.title.trim() : null,
    description: typeof parsed.description === "string" ? parsed.description : null,
    priority: parsed.priority,
    date: typeof parsed.date === "string" ? parsed.date : null,
    time: typeof parsed.time === "string" ? parsed.time : null,
    target: typeof parsed.target === "string" ? parsed.target.trim() : null,
    updates: parsed.updates,
    response: typeof parsed.response === "string" ? parsed.response : null
  };
}

export async function resolveAIUpdateTarget(message, intent, target, candidates) {
  const available = candidates.slice(0, 100).map(item => ({
    id: item.id,
    title: item.title
  }));

  const prompt = `
Pilih satu data yang paling cocok dengan target pengguna.

Jenis data: ${intent}
Target dari pengguna: ${target}
Pesan asli: ${message}

Data yang tersedia:
${JSON.stringify(available)}

Aturan:
- Pilih ID hanya jika target cocok dengan satu data secara jelas.
- Jangan menebak.
- Jika tidak yakin atau ada lebih dari satu kemungkinan, gunakan null.
- Kembalikan JSON saja.

Schema:
{"target_id": null}
`;

  const result = parseJson(await askAI(prompt));
  const targetId = typeof result.target_id === "string" ? result.target_id : null;

  if (!targetId || !candidates.some(item => item.id === targetId)) {
    return null;
  }

  return targetId;
}
