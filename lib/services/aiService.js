
import { askAI } from "../integrations/cloudflare.js";

export async function parseAIRequest(message) {
  const now = new Date();

  const currentTime = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Makassar",
    dateStyle: "short",
    timeStyle: "short"
  }).format(now);

  const prompt = `
Kamu adalah AI Assistant TaskPilot.
Waktu sekarang: ${currentTime} WITA.
Zona waktu: Asia/Makassar (UTC+8).

Analisis permintaan pengguna dan kembalikan JSON valid saja.

Format:
{
  "intent": "create_task | create_reminder | unknown",
  "title": "judul",
  "description": null,
  "priority": "low | medium | high | urgent",
  "datetime": null,
  "response": "pesan singkat"
}

Aturan:
- create_task untuk membuat tugas.
- create_reminder untuk membuat pengingat.
- unknown jika permintaan tidak jelas atau bukan permintaan membuat tugas/pengingat.
- datetime wajib berformat YYYY-MM-DD HH:mm WITA jika waktu disebutkan.
- Jika tanggal atau waktu tidak disebutkan, gunakan null.
- Jangan mengarang tanggal atau waktu.
- Prioritas default medium.
- Judul harus singkat dan jelas.
- Jangan menambahkan Markdown.

Permintaan pengguna:
${message}
`;

  const result = await askAI(prompt);

  try {
    const parsed = JSON.parse(result);

    if (!["create_task", "create_reminder", "unknown"].includes(parsed.intent)) {
      throw new Error("Invalid AI intent");
    }

    if (!["low", "medium", "high", "urgent"].includes(parsed.priority)) {
      parsed.priority = "medium";
    }

    return parsed;
  } catch {
    throw new Error("Invalid AI response");
  }
}
