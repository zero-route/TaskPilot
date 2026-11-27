
import { config } from "../config/env.js";
import { supabase } from "../integrations/supabase.js";
import { sendMessage } from "../integrations/telegram.js";
import {
  createTask,
  getTasks,
  completeTask,
  deleteTask,
  updateTask
} from "../services/taskService.js";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from "../services/categoryService.js";
import {
  createReminder,
  getReminders
} from "../services/reminderService.js";

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
    await sendMessage(chatId, "Selamat datang di TaskPilot!\n\nPlan smarter. Stay focused. Get things done.\n\nGunakan /help untuk melihat daftar perintah.");
    return;
  }

  if (command === "/help") {
    await sendMessage(chatId, "TASKPILOT COMMANDS\n\n/add Judul tugas\n/tasks\n/done ID\n/delete ID\n/edit ID title|description|priority nilai\n/categories\n/categoryadd Nama kategori\n/category TASK_ID CATEGORY_ID\n/categoryedit CATEGORY_ID Nama baru\n/categorydelete CATEGORY_ID\n/categoryremove TASK_ID\n/remind YYYY-MM-DD HH:MM Judul\n/reminders\n/dbtest");
    return;
  }

  if (command === "/dbtest") {
    try {
      const { error } = await supabase.from("tasks").select("*").limit(1);

      if (error) throw error;

      await sendMessage(chatId, "Koneksi Supabase berhasil!");
    } catch {
      await sendMessage(chatId, "Koneksi Supabase gagal.");
    }
    return;
  }

  if (command === "/remind") {
    const date = args[0];
    const time = args[1];
    const title = args.slice(2).join(" ");

    if (
      !date ||
      !time ||
      !title ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    ) {
      await sendMessage(chatId, "Format: /remind YYYY-MM-DD HH:MM Judul pengingat\n\nContoh: /remind 2026-11-28 18:30 Belajar programming\n\nWaktu menggunakan WITA (UTC+8).");
      return;
    }

    try {
      const reminder = await createReminder({
        title,
        scheduled_at: `${date}T${time}:00+08:00`
      });

      const formattedDate = new Intl.DateTimeFormat("id-ID", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Makassar"
      }).format(new Date(reminder.scheduled_at));

      await sendMessage(chatId, `Pengingat berhasil dibuat!\n\nJudul: ${reminder.title}\nWaktu: ${formattedDate}\nStatus: ${reminder.status}\nID: ${reminder.id}`);
    } catch (error) {
      await sendMessage(
        chatId,
        error.message === "Reminder time must be in the future"
          ? "Waktu pengingat harus berada di masa depan."
          : "Gagal membuat pengingat. Periksa data dan coba lagi."
      );
    }
    return;
  }

  if (command === "/reminders") {
    try {
      const reminders = await getReminders();

      if (!reminders.length) {
        await sendMessage(chatId, "Belum ada pengingat.");
        return;
      }

      const list = reminders.map((reminder, index) => {
        const formattedDate = new Intl.DateTimeFormat("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Makassar"
        }).format(new Date(reminder.scheduled_at));

        return `${index + 1}. ${reminder.title}\nID: ${reminder.id}\nWaktu: ${formattedDate}\nStatus: ${reminder.status}`;
      });

      await sendMessage(chatId, `DAFTAR PENGINGAT\n\n${list.join("\n\n")}`);
    } catch {
      await sendMessage(chatId, "Gagal mengambil daftar pengingat.");
    }
    return;
  }

  if (command === "/categoryadd") {
    const name = args.join(" ");

    if (!name) {
      await sendMessage(chatId, "Format: /categoryadd Nama kategori");
      return;
    }

    try {
      const category = await createCategory(name);
      await sendMessage(chatId, `Kategori berhasil dibuat!\n\nID: ${category.id}\nNama: ${category.name}`);
    } catch {
      await sendMessage(chatId, "Gagal membuat kategori.");
    }
    return;
  }

  if (command === "/categories") {
    try {
      const categories = await getCategories();

      if (!categories.length) {
        await sendMessage(chatId, "Belum ada kategori.");
        return;
      }

      const list = categories.map((category, index) => `${index + 1}. ${category.name}\nID: ${category.id}`);

      await sendMessage(chatId, `DAFTAR KATEGORI\n\n${list.join("\n\n")}`);
    } catch {
      await sendMessage(chatId, "Gagal mengambil daftar kategori.");
    }
    return;
  }

  if (command === "/category") {
    const taskId = args[0];
    const categoryId = args[1];

    if (!taskId || !categoryId) {
      await sendMessage(chatId, "Format: /category TASK_ID CATEGORY_ID");
      return;
    }

    try {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("id, name")
        .eq("id", categoryId)
        .maybeSingle();

      if (categoryError) throw categoryError;

      if (!category) {
        await sendMessage(chatId, "Kategori tidak ditemukan.");
        return;
      }

      const task = await updateTask(taskId, { category_id: categoryId });

      if (!task) {
        await sendMessage(chatId, "Tugas tidak ditemukan.");
        return;
      }

      await sendMessage(chatId, `Kategori berhasil dipasang!\n\nTugas: ${task.title}\nKategori: ${category.name}`);
    } catch {
      await sendMessage(chatId, "Gagal memasang kategori. Periksa ID tugas dan kategori.");
    }
    return;
  }

  if (command === "/categoryremove") {
    const taskId = args[0];

    if (!taskId) {
      await sendMessage(chatId, "Format: /categoryremove TASK_ID");
      return;
    }

    try {
      const task = await updateTask(taskId, { category_id: null });

      await sendMessage(
        chatId,
        task
          ? `Kategori berhasil dilepas dari tugas!\n\nTugas: ${task.title}`
          : "Tugas tidak ditemukan."
      );
    } catch {
      await sendMessage(chatId, "Gagal melepas kategori dari tugas.");
    }
    return;
  }

  if (command === "/categoryedit") {
    const categoryId = args[0];
    const name = args.slice(1).join(" ");

    if (!categoryId || !name) {
      await sendMessage(chatId, "Format: /categoryedit CATEGORY_ID Nama baru");
      return;
    }

    try {
      const category = await updateCategory(categoryId, name);

      await sendMessage(
        chatId,
        category
          ? `Kategori berhasil diubah!\n\nNama: ${category.name}\nID: ${category.id}`
          : "Kategori tidak ditemukan."
      );
    } catch {
      await sendMessage(chatId, "Gagal mengubah kategori.");
    }
    return;
  }

  if (command === "/categorydelete") {
    const categoryId = args[0];

    if (!categoryId) {
      await sendMessage(chatId, "Format: /categorydelete CATEGORY_ID");
      return;
    }

    try {
      const deleted = await deleteCategory(categoryId);

      await sendMessage(
        chatId,
        deleted
          ? "Kategori berhasil dihapus."
          : "Kategori tidak ditemukan."
      );
    } catch (error) {
      await sendMessage(
        chatId,
        error.message === "Category is still assigned to tasks"
          ? "Kategori tidak bisa dihapus karena masih digunakan oleh tugas."
          : "Gagal menghapus kategori."
      );
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
      await sendMessage(chatId, "Gagal membuat tugas.");
    }
    return;
  }

  if (command === "/tasks") {
    try {
      const tasks = await getTasks();

      if (!tasks.length) {
        await sendMessage(chatId, "Belum ada tugas.");
        return;
      }

      const list = tasks.map((task, index) => `${index + 1}. ${task.title}\nID: ${task.id}\nStatus: ${task.status ?? "pending"}\nPrioritas: ${task.priority ?? "medium"}\nKategori: ${task.categories?.name ?? "Belum ada"}`);

      await sendMessage(chatId, `DAFTAR TUGAS\n\n${list.join("\n\n")}`);
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

      await sendMessage(chatId, task ? `Tugas selesai!\n\n${task.title}` : "Tugas tidak ditemukan.");
    } catch {
      await sendMessage(chatId, "Gagal menyelesaikan tugas.");
    }
    return;
  }

  if (command === "/edit") {
    const id = args[0];
    const field = args[1];
    const value = args.slice(2).join(" ");
    const allowedFields = ["title", "description", "priority"];

    if (!id || !allowedFields.includes(field) || !value) {
      await sendMessage(chatId, "Format: /edit ID title Judul baru\n/edit ID description Deskripsi baru\n/edit ID priority low|medium|high|urgent");
      return;
    }

    if (field === "priority" && !["low", "medium", "high", "urgent"].includes(value)) {
      await sendMessage(chatId, "Prioritas harus low, medium, high, atau urgent.");
      return;
    }

    try {
      const task = await updateTask(id, { [field]: value });
      await sendMessage(chatId, task ? `Tugas berhasil diperbarui!\n\nJudul: ${task.title}\nPrioritas: ${task.priority}` : "Tugas tidak ditemukan.");
    } catch {
      await sendMessage(chatId, "Gagal memperbarui tugas.");
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
      await sendMessage(chatId, deleted ? "Tugas berhasil dihapus." : "Tugas tidak ditemukan.");
    } catch {
      await sendMessage(chatId, "Gagal menghapus tugas.");
    }
    return;
  }

  await sendMessage(chatId, "Perintah tidak dikenal. Gunakan /help.");
}
