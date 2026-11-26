
import { config } from "../config/env.js";
import { supabase } from "../integrations/supabase.js";
import { sendMessage } from "../integrations/telegram.js";
import {
  createTask,
  getTasks,
  completeTask,
  deleteTask
} from "../services/taskService.js";

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

  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const chatId = message.chat.id;

  if (command === "/start") {
    await sendMessage(
      chatId,
      "Selamat datang di TaskPilot!\n\nPlan smarter. Stay focused. Get things done.\n\nGunakan /help untuk melihat daftar perintah."
    );
    return;
  }

  if (command === "/help") {
    await sendMessage(
      chatId,
      "TASKPILOT COMMANDS\n\n/add Judul tugas\n/tasks\n/done ID\n/delete ID\n/dbtest"
    );
    return;
  }

  if (command === "/dbtest") {
    try {
      const { error } = await supabase.from("tasks").select("*").limit(1);

      if (error) {
        throw error;
      }

      await sendMessage(chatId, "Koneksi Supabase berhasil!");
    } catch {
      await sendMessage(chatId, "Koneksi Supabase gagal.");
    }
    return;
  }

  if (command === "/add") {
    const title = args.join(" ");

    if (!title) {
      await sendMessage(chatId, "Format: /add Judul tugas");
      return;
    }

    try {
      const task = await createTask({ title });
      await sendMessage(chatId, `Tugas berhasil dibuat!\n\nID: ${task.id}\nJudul: ${task.title}`);
    } catch {
      await sendMessage(chatId, "Gagal membuat tugas. Periksa database.");
    }
    return;
  }

  if (command === "/tasks") {
    try {
      const tasks = await getTasks();

      if (tasks.length === 0) {
        await sendMessage(chatId, "Belum ada tugas.");
        return;
      }

      const taskList = tasks.map((task, index) =>
        `${index + 1}. ${task.title}\nID: ${task.id}\nStatus: ${task.status ?? "pending"}`
      );

      await sendMessage(chatId, `DAFTAR TUGAS\n\n${taskList.join("\n\n")}`);
    } catch {
      await sendMessage(chatId, "Gagal mengambil daftar tugas.");
    }
    return;
  }

  if (command === "/done") {
    const id = args[0];

    if (!id) {
      await sendMessage(chatId, "Format: /done ID");
      return;
    }

    try {
      const task = await completeTask(id);

      if (!task) {
        await sendMessage(chatId, "Tugas tidak ditemukan.");
        return;
      }

      await sendMessage(chatId, `Tugas selesai!\n\n${task.title}`);
    } catch {
      await sendMessage(chatId, "Gagal menyelesaikan tugas.");
    }
    return;
  }

  if (command === "/delete") {
    const id = args[0];

    if (!id) {
      await sendMessage(chatId, "Format: /delete ID");
      return;
    }

    try {
      const deleted = await deleteTask(id);

      await sendMessage(
        chatId,
        deleted ? "Tugas berhasil dihapus." : "Tugas tidak ditemukan."
      );
    } catch {
      await sendMessage(chatId, "Gagal menghapus tugas.");
    }
    return;
  }

  await sendMessage(chatId, "Perintah tidak dikenal. Gunakan /help.");
}
