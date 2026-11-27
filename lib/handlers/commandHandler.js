
import { config } from "../config/env.js";
import { supabase } from "../integrations/supabase.js";
import { sendMessage } from "../integrations/telegram.js";
import {
  createTask,
  getTasks,
  getTodayTasks,
  getTomorrowTasks,
  getWeekTasks,
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
  getReminders,
  updateReminder,
  deleteReminder
} from "../services/reminderService.js";

function isValidDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return false;
  }

  const parsed = new Date(`${date}T${time}:00+08:00`);

  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().startsWith(`${date}T${time}:`);
}

export async function handleTelegramUpdate(update) {
  const message = update.message;

  if (!message?.from?.id || !message?.chat?.id) return;
  if (String(message.from.id) !== config.ownerTelegramId) return;

  const text = message.text?.trim();
  if (!text) return;

  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const chatId = message.chat.id;

  if (command === "/start") {
    await sendMessage(chatId, "Selamat datang di TaskPilot!\n\nPlan smarter. Stay focused. Get things done.\n\nGunakan /help untuk melihat daftar perintah.");
    return;
  }

  if (command === "/help") {
    await sendMessage(chatId, "TASKPILOT COMMANDS\n\n/add Judul tugas\n/add YYYY-MM-DD HH:MM Judul tugas\n/tasks\n/today\n/tomorrow\n/week\n/done ID\n/delete ID\n/edit ID title|description|priority|due_at nilai\n/categories\n/categoryadd Nama kategori\n/category TASK_ID CATEGORY_ID\n/categoryedit CATEGORY_ID Nama baru\n/categorydelete CATEGORY_ID\n/categoryremove TASK_ID\n/remind YYYY-MM-DD HH:MM Judul\n/reminders\n/remindedit ID title Judul baru\n/remindedit ID time YYYY-MM-DD HH:MM\n/reminddelete ID\n/dbtest");
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

    if (!date || !time || !title || !isValidDateTime(date, time)) {
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
      await sendMessage(chatId, error.message === "Reminder time must be in the future" ? "Waktu pengingat harus berada di masa depan." : "Gagal membuat pengingat. Periksa data dan coba lagi.");
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

  if (command === "/remindedit") {
    const reminderId = args[0];
    const field = args[1];

    if (!reminderId || !field) {
      await sendMessage(chatId, "Format:\n/remindedit ID title Judul baru\n/remindedit ID time YYYY-MM-DD HH:MM");
      return;
    }

    const updates = {};

    if (field === "title") {
      const title = args.slice(2).join(" ");

      if (!title) {
        await sendMessage(chatId, "Format: /remindedit ID title Judul baru");
        return;
      }

      updates.title = title;
    } else if (field === "time") {
      const date = args[2];
      const time = args[3];

      if (!date || !time || !isValidDateTime(date, time)) {
        await sendMessage(chatId, "Format: /remindedit ID time YYYY-MM-DD HH:MM");
        return;
      }

      updates.scheduled_at = `${date}T${time}:00+08:00`;
    } else {
      await sendMessage(chatId, "Field hanya bisa title atau time.");
      return;
    }

    try {
      const reminder = await updateReminder(reminderId, updates);

      if (!reminder) {
        await sendMessage(chatId, "Pengingat tidak ditemukan atau statusnya bukan pending.");
        return;
      }

      const formattedDate = new Intl.DateTimeFormat("id-ID", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Makassar"
      }).format(new Date(reminder.scheduled_at));

      await sendMessage(chatId, `Pengingat berhasil diperbarui!\n\nJudul: ${reminder.title}\nWaktu: ${formattedDate}\nStatus: ${reminder.status}`);
    } catch (error) {
      await sendMessage(chatId, error.message === "Invalid reminder date" ? "Waktu pengingat harus berada di masa depan." : "Gagal memperbarui pengingat.");
    }
    return;
  }

  if (command === "/reminddelete") {
    const reminderId = args[0];

    if (!reminderId) {
      await sendMessage(chatId, "Format: /reminddelete ID");
      return;
    }

    try {
      const deleted = await deleteReminder(reminderId);
      await sendMessage(chatId, deleted ? "Pengingat berhasil dihapus." : "Pengingat tidak ditemukan atau statusnya bukan pending.");
    } catch {
      await sendMessage(chatId, "Gagal menghapus pengingat.");
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
      const { data: category, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("id", categoryId)
        .maybeSingle();

      if (error) throw error;

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
      await sendMessage(chatId, task ? `Kategori berhasil dilepas dari tugas!\n\nTugas: ${task.title}` : "Tugas tidak ditemukan.");
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
      await sendMessage(chatId, category ? `Kategori berhasil diubah!\n\nNama: ${category.name}\nID: ${category.id}` : "Kategori tidak ditemukan.");
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
      await sendMessage(chatId, deleted ? "Kategori berhasil dihapus." : "Kategori tidak ditemukan.");
    } catch (error) {
      await sendMessage(chatId, error.message === "Category is still assigned to tasks" ? "Kategori tidak bisa dihapus karena masih digunakan oleh tugas." : "Gagal menghapus kategori.");
    }
    return;
  }

  if (command === "/add") {
    let title = args.join(" ");
    let dueAt = null;

    if (args.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
      const date = args[0];
      const time = args[1];
      title = args.slice(2).join(" ");

      if (!title || !isValidDateTime(date, time)) {
        await sendMessage(chatId, "Format: /add YYYY-MM-DD HH:MM Judul tugas");
        return;
      }

      dueAt = `${date}T${time}:00+08:00`;
    }

    if (!title) {
      await sendMessage(chatId, "Format: /add Judul tugas\n/add YYYY-MM-DD HH:MM Judul tugas");
      return;
    }

    try {
      const task = await createTask({ title, due_at: dueAt });
      const dueText = task.due_at
        ? `\nDeadline: ${new Intl.DateTimeFormat("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Makassar"
          }).format(new Date(task.due_at))}`
        : "";

      await sendMessage(chatId, `Tugas berhasil dibuat!\n\nID: ${task.id}\nJudul: ${task.title}${dueText}`);
    } catch {
      await sendMessage(chatId, "Gagal membuat tugas.");
    }
    return;
  }

  if (command === "/today" || command === "/tomorrow" || command === "/week") {
    try {
      let tasks;
      let heading;
      let emptyMessage;

      if (command === "/today") {
        tasks = await getTodayTasks();
        heading = "AGENDA HARI INI";
        emptyMessage = "Belum ada tugas dengan deadline hari ini.";
      } else if (command === "/tomorrow") {
        tasks = await getTomorrowTasks();
        heading = "AGENDA BESOK";
        emptyMessage = "Belum ada tugas dengan deadline besok.";
      } else {
        tasks = await getWeekTasks();
        heading = "AGENDA 7 HARI KE DEPAN";
        emptyMessage = "Belum ada tugas dengan deadline dalam 7 hari ke depan.";
      }

      if (!tasks.length) {
        await sendMessage(chatId, emptyMessage);
        return;
      }

      const list = tasks.map((task, index) => {
        const formattedDate = new Intl.DateTimeFormat("id-ID", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          timeZone: "Asia/Makassar"
        }).format(new Date(task.due_at));

        const time = new Intl.DateTimeFormat("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Makassar"
        }).format(new Date(task.due_at));

        return `${index + 1}. ${task.title}\nTanggal: ${formattedDate}\nJam: ${time} WITA\nPrioritas: ${task.priority}\nStatus: ${task.status}`;
      });

      await sendMessage(chatId, `${heading}\n\n${list.join("\n\n")}`);
    } catch {
      await sendMessage(chatId, command === "/week" ? "Gagal mengambil agenda mingguan." : command === "/tomorrow" ? "Gagal mengambil agenda besok." : "Gagal mengambil agenda hari ini.");
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
    const allowedFields = ["title", "description", "priority", "due_at"];
    let value;

    if (field === "due_at") {
      const date = args[2];
      const time = args[3];

      if (!id || !date || !time || !isValidDateTime(date, time)) {
        await sendMessage(chatId, "Format: /edit ID due_at YYYY-MM-DD HH:MM");
        return;
      }

      value = `${date}T${time}:00+08:00`;
    } else {
      value = args.slice(2).join(" ");

      if (!id || !allowedFields.includes(field) || !value) {
        await sendMessage(chatId, "Format:\n/edit ID title Judul baru\n/edit ID description Deskripsi baru\n/edit ID priority low|medium|high|urgent\n/edit ID due_at YYYY-MM-DD HH:MM");
        return;
      }
    }

    if (field === "priority" && !["low", "medium", "high", "urgent"].includes(value)) {
      await sendMessage(chatId, "Prioritas harus low, medium, high, atau urgent.");
      return;
    }

    try {
      const task = await updateTask(id, { [field]: value });
      await sendMessage(chatId, task ? `Tugas berhasil diperbarui!\n\nJudul: ${task.title}\nPrioritas: ${task.priority}\nDeadline: ${task.due_at ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Makassar"
      }).format(new Date(task.due_at)) : "Tidak ada"}` : "Tugas tidak ditemukan.");
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
