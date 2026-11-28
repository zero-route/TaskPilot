
import { sendMessage } from "../integrations/telegram.js";
import { createAIPlan } from "../services/aiService.js";
import {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  completeTask
} from "../services/taskService.js";
import {
  createReminder,
  getReminders,
  updateReminder,
  deleteReminder
} from "../services/reminderService.js";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from "../services/categoryService.js";
import {
  savePendingAction,
  getPendingAction,
  clearPendingAction
} from "../services/aiPendingService.js";

const allowedActions = new Set([
  "create_task",
  "update_task",
  "delete_task",
  "complete_task",
  "create_reminder",
  "update_reminder",
  "delete_reminder",
  "create_category",
  "update_category",
  "delete_category",
  "assign_category",
  "remove_category",
  "list_tasks",
  "list_reminders",
  "list_categories"
]);

const taskFields = new Set([
  "title",
  "description",
  "priority",
  "date",
  "time",
  "category_id",
  "category_name"
]);

const reminderFields = new Set([
  "title",
  "date",
  "time"
]);

function isConfirmation(text) {
  return /^(ya|iya|y|setuju|konfirmasi|oke|ok|gas|lanjut)$/i.test(text.trim());
}

function isCancellation(text) {
  return /^(tidak|enggak|nggak|gak|ga|batal|cancel|no)$/i.test(text.trim());
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Makassar"
  }).format(new Date(value));
}

function makeDateTime(date, time) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Tanggal tidak valid atau belum disebutkan.");
  }

  const selectedTime = time || "08:00";

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(selectedTime)) {
    throw new Error("Format waktu tidak valid.");
  }

  const parsed = new Date(`${date}T${selectedTime}:00+08:00`);

  if (
    Number.isNaN(parsed.getTime()) ||
    !parsed.toISOString().startsWith(`${date}T${selectedTime}:`)
  ) {
    throw new Error("Tanggal atau waktu tidak valid.");
  }

  return parsed.toISOString();
}

function resolveDateFields(source, targetField) {
  const result = {};

  if (source.date || source.time) {
    result[targetField] = makeDateTime(source.date, source.time);
  }

  return result;
}

function findById(records, id) {
  return records.find(record => record.id === id) || null;
}

function findCategory(categories, action, createdCategories) {
  if (action.category_id) {
    return findById(categories, action.category_id) ||
      createdCategories.find(item => item.id === action.category_id) ||
      null;
  }

  if (action.category_name) {
    const name = action.category_name.trim().toLocaleLowerCase("id-ID");

    const matches = [
      ...categories,
      ...createdCategories
    ].filter(category =>
      category.name.toLocaleLowerCase("id-ID") === name
    );

    return matches.length === 1 ? matches[0] : null;
  }

  return null;
}

function validatePlan(actions, context) {
  if (!actions.length) return [];

  if (actions.length > 20) {
    throw new Error("Maksimal 20 tindakan dalam satu permintaan.");
  }

  const tasks = context.tasks;
  const reminders = context.reminders;
  const categories = context.categories;

  return actions.map(action => {
    if (!action || !allowedActions.has(action.type)) {
      throw new Error("AI menghasilkan jenis tindakan yang tidak didukung.");
    }

    if (action.type === "update_task") {
      if (!findById(tasks, action.target_id)) {
        throw new Error("Target tugas tidak ditemukan atau belum jelas.");
      }

      const updates = action.updates || {};
      const clean = {};

      for (const [key, value] of Object.entries(updates)) {
        if (!taskFields.has(key)) continue;
        clean[key] = value;
      }

      if (Object.hasOwn(clean, "priority") &&
        !["low", "medium", "high", "urgent"].includes(clean.priority)) {
        throw new Error("Prioritas tugas tidak valid.");
      }

      if (Object.hasOwn(clean, "date") || Object.hasOwn(clean, "time")) {
        Object.assign(clean, resolveDateFields(clean, "due_at"));
        delete clean.date;
        delete clean.time;
      }

      if (clean.category_name) {
        const category = categories.find(item =>
          item.name.toLocaleLowerCase("id-ID") ===
          String(clean.category_name).trim().toLocaleLowerCase("id-ID")
        );

        if (!category) {
          throw new Error(`Kategori "${clean.category_name}" tidak ditemukan.`);
        }

        clean.category_id = category.id;
        delete clean.category_name;
      }

      if (!Object.keys(clean).length) {
        throw new Error("Tidak ada perubahan tugas yang valid.");
      }

      return { ...action, updates: clean };
    }

    if (action.type === "update_reminder") {
      const reminder = findById(reminders, action.target_id);

      if (!reminder || reminder.status !== "pending") {
        throw new Error("Pengingat tidak ditemukan atau bukan berstatus pending.");
      }

      const updates = action.updates || {};
      const clean = {};

      for (const [key, value] of Object.entries(updates)) {
        if (reminderFields.has(key) && key !== "date" && key !== "time") {
          clean[key] = value;
        }
      }

      Object.assign(clean, resolveDateFields(updates, "scheduled_at"));

      if (!Object.keys(clean).length) {
        throw new Error("Tidak ada perubahan pengingat yang valid.");
      }

      return { ...action, updates: clean };
    }

    if (["delete_task", "complete_task", "assign_category", "remove_category"].includes(action.type)) {
      if (!findById(tasks, action.target_id)) {
        throw new Error("Target tugas tidak ditemukan atau belum jelas.");
      }
    }

    if (["delete_reminder"].includes(action.type)) {
      const reminder = findById(reminders, action.target_id);

      if (!reminder || reminder.status !== "pending") {
        throw new Error("Pengingat tidak ditemukan atau bukan berstatus pending.");
      }
    }

    if (action.type === "update_category" || action.type === "delete_category") {
      if (!findById(categories, action.target_id)) {
        throw new Error("Kategori tidak ditemukan atau belum jelas.");
      }
    }

    if (action.type === "create_task" && !String(action.title || "").trim()) {
      throw new Error("Judul tugas belum disebutkan.");
    }

    if (action.type === "create_reminder") {
      if (!String(action.title || "").trim() || !action.date) {
        throw new Error("Judul dan tanggal pengingat harus disebutkan.");
      }
      makeDateTime(action.date, action.time);
    }

    if (action.type === "create_category" && !String(action.title || "").trim()) {
      throw new Error("Nama kategori belum disebutkan.");
    }

    if (action.type === "update_category" && !String(action.title || "").trim()) {
      throw new Error("Nama baru kategori belum disebutkan.");
    }

    if (action.type === "create_task" && action.date) {
      makeDateTime(action.date, action.time);
    }

    return action;
  });
}

function isMutating(action) {
  return !action.type.startsWith("list_");
}

function describeAction(action, context) {
  const task = findById(context.tasks, action.target_id);
  const reminder = findById(context.reminders, action.target_id);
  const category = findById(context.categories, action.target_id);

  const labels = {
    create_task: "Buat tugas",
    update_task: "Ubah tugas",
    delete_task: "Hapus tugas",
    complete_task: "Selesaikan tugas",
    create_reminder: "Buat pengingat",
    update_reminder: "Ubah pengingat",
    delete_reminder: "Hapus pengingat",
    create_category: "Buat kategori",
    update_category: "Ubah kategori",
    delete_category: "Hapus kategori",
    assign_category: "Pasang kategori ke tugas",
    remove_category: "Lepaskan kategori dari tugas",
    list_tasks: "Tampilkan daftar tugas",
    list_reminders: "Tampilkan daftar pengingat",
    list_categories: "Tampilkan daftar kategori"
  };

  const details = [];

  if (action.title) details.push(`Nama: ${action.title}`);
  if (task) details.push(`Tugas: ${task.title}`);
  if (reminder) details.push(`Pengingat: ${reminder.title}`);
  if (category) details.push(`Kategori: ${category.name}`);
  if (action.updates) {
    for (const [key, value] of Object.entries(action.updates)) {
      let formatted = value ?? "Kosong";

      if (key === "due_at" || key === "scheduled_at") {
        formatted = formatDateTime(value);
      }

      details.push(`${key}: ${formatted}`);
    }
  }

  if (action.category_name) {
    details.push(`Kategori tujuan: ${action.category_name}`);
  }

  if (action.date) {
    details.push(`Tanggal: ${action.date}`);
    details.push(`Waktu: ${action.time || "08:00"} WITA`);
  }

  return `${labels[action.type] || action.type}${details.length ? `\n${details.join("\n")}` : ""}`;
}

function formatTaskList(tasks) {
  if (!tasks.length) return "Belum ada tugas.";

  return `DAFTAR TUGAS\n\n${tasks.slice(0, 30).map((task, index) =>
    `${index + 1}. ${task.title}\nID: ${task.id}\nStatus: ${task.status}\nPrioritas: ${task.priority}\nDeadline: ${task.due_at ? formatDateTime(task.due_at) : "Tidak ada"}\nKategori: ${task.categories?.name || "Belum ada"}`
  ).join("\n\n")}`;
}

function formatReminderList(reminders) {
  if (!reminders.length) return "Belum ada pengingat.";

  return `DAFTAR PENGINGAT\n\n${reminders.slice(0, 30).map((item, index) =>
    `${index + 1}. ${item.title}\nID: ${item.id}\nWaktu: ${formatDateTime(item.scheduled_at)}\nStatus: ${item.status}`
  ).join("\n\n")}`;
}

function formatCategoryList(categories) {
  if (!categories.length) return "Belum ada kategori.";

  return `DAFTAR KATEGORI\n\n${categories.map((item, index) =>
    `${index + 1}. ${item.name}\nID: ${item.id}`
  ).join("\n\n")}`;
}

async function executeActions(chatId, actions, context) {
  const results = [];
  const createdCategories = [];

  for (const action of actions) {
    try {
      let result;

      if (action.type === "create_task") {
        let categoryId = null;

        if (action.category_name) {
          const category = findCategory(context.categories, action, createdCategories);
          if (!category) throw new Error(`Kategori "${action.category_name}" tidak ditemukan.`);
          categoryId = category.id;
        }

        result = await createTask({
          title: action.title,
          description: action.description || null,
          priority: ["low", "medium", "high", "urgent"].includes(action.priority)
            ? action.priority
            : "medium",
          due_at: action.date ? makeDateTime(action.date, action.time) : null,
          category_id: categoryId
        });

        results.push(`✅ Tugas dibuat: ${result.title}\nID: ${result.id}`);
        continue;
      }

      if (action.type === "update_task") {
        result = await updateTask(action.target_id, action.updates);
        if (!result) throw new Error("Tugas tidak ditemukan.");
        results.push(`✅ Tugas diperbarui: ${result.title}`);
        continue;
      }

      if (action.type === "delete_task") {
        const deleted = await deleteTask(action.target_id);
        if (!deleted) throw new Error("Tugas tidak ditemukan.");
        results.push("🗑️ Tugas berhasil dihapus.");
        continue;
      }

      if (action.type === "complete_task") {
        result = await completeTask(action.target_id);
        if (!result) throw new Error("Tugas tidak ditemukan.");
        results.push(`✅ Tugas selesai: ${result.title}`);
        continue;
      }

      if (action.type === "create_reminder") {
        result = await createReminder({
          title: action.title,
          scheduled_at: makeDateTime(action.date, action.time)
        });
        results.push(`⏰ Pengingat dibuat: ${result.title}\nWaktu: ${formatDateTime(result.scheduled_at)}`);
        continue;
      }

      if (action.type === "update_reminder") {
        result = await updateReminder(action.target_id, action.updates);
        if (!result) throw new Error("Pengingat tidak ditemukan atau bukan pending.");
        results.push(`✅ Pengingat diperbarui: ${result.title}`);
        continue;
      }

      if (action.type === "delete_reminder") {
        const deleted = await deleteReminder(action.target_id);
        if (!deleted) throw new Error("Pengingat tidak ditemukan atau bukan pending.");
        results.push("🗑️ Pengingat berhasil dihapus.");
        continue;
      }

      if (action.type === "create_category") {
        result = await createCategory(action.title);
        createdCategories.push(result);
        results.push(`🏷️ Kategori dibuat: ${result.name}\nID: ${result.id}`);
        continue;
      }

      if (action.type === "update_category") {
        result = await updateCategory(action.target_id, action.title);
        if (!result) throw new Error("Kategori tidak ditemukan.");
        results.push(`✅ Kategori diubah: ${result.name}`);
        continue;
      }

      if (action.type === "delete_category") {
        const deleted = await deleteCategory(action.target_id);
        if (!deleted) throw new Error("Kategori tidak ditemukan.");
        results.push("🗑️ Kategori berhasil dihapus.");
        continue;
      }

      if (action.type === "assign_category" || action.type === "remove_category") {
        const category = action.type === "remove_category"
          ? null
          : findCategory(context.categories, action, createdCategories);

        if (action.type === "assign_category" && !category) {
          throw new Error("Kategori tujuan tidak ditemukan.");
        }

        result = await updateTask(action.target_id, {
          category_id: category?.id || null
        });

        if (!result) throw new Error("Tugas tidak ditemukan.");

        results.push(
          action.type === "assign_category"
            ? `🏷️ ${result.title} dimasukkan ke kategori ${category.name}.`
            : `🏷️ Kategori dilepas dari ${result.title}.`
        );
        continue;
      }

      if (action.type === "list_tasks") {
        const tasks = await getTasks(action.status || null);
        results.push(formatTaskList(tasks));
        continue;
      }

      if (action.type === "list_reminders") {
        results.push(formatReminderList(await getReminders()));
        continue;
      }

      if (action.type === "list_categories") {
        results.push(formatCategoryList(await getCategories()));
      }
    } catch (error) {
      console.error("TaskPilot AI action failed:", error);
      results.push(`⚠️ ${action.type}: ${error.message || "Gagal dijalankan."}`);
    }
  }

  if (results.length) {
    await sendMessage(chatId, `HASIL TASKPILOT\n\n${results.join("\n\n")}`);
  }
}

async function prepareContext() {
  const [tasks, reminders, categories] = await Promise.all([
    getTasks(),
    getReminders(),
    getCategories()
  ]);

  return {
    tasks: tasks.slice(0, 100).map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: item.status,
      due_at: item.due_at,
      category_id: item.category_id,
      category_name: item.categories?.name || null
    })),
    reminders: reminders.slice(0, 100).map(item => ({
      id: item.id,
      title: item.title,
      scheduled_at: item.scheduled_at,
      status: item.status
    })),
    categories: categories.map(item => ({
      id: item.id,
      name: item.name
    }))
  };
}

export async function handleAIMessage(chatId, message) {
  let pending;

  try {
    pending = await getPendingAction(chatId);
  } catch (error) {
    console.error("AI pending action retrieval failed:", error);
    await sendMessage(chatId, "Gagal memeriksa konfirmasi sebelumnya.");
    return;
  }

  if (pending?.action_type === "ai_batch") {
    if (isConfirmation(message)) {
      await clearPendingAction(chatId);
      await executeActions(chatId, pending.payload.actions, pending.payload.context);
      return;
    }

    if (isCancellation(message)) {
      await clearPendingAction(chatId);
      await sendMessage(chatId, "Tindakan dibatalkan. Tidak ada perubahan yang dijalankan.");
      return;
    }

    await clearPendingAction(chatId);
    await sendMessage(chatId, "Konfirmasi sebelumnya dibatalkan karena ada permintaan baru.");
  } else if (isConfirmation(message) || isCancellation(message)) {
    await sendMessage(chatId, "Tidak ada tindakan AI yang menunggu konfirmasi.");
    return;
  }

  try {
    const context = await prepareContext();
    const plan = await createAIPlan(message, context);
    const actions = validatePlan(plan.actions, context);

    if (!actions.length) {
      await sendMessage(chatId, plan.response || "Saya belum memahami permintaan tersebut. Bisa jelaskan dengan cara lain?");
      return;
    }

    const hasChanges = actions.some(isMutating);

    if (!hasChanges) {
      await executeActions(chatId, actions, context);
      return;
    }

    const preview = actions.map((action, index) =>
      `${index + 1}. ${describeAction(action, context)}`
    ).join("\n\n");

    await savePendingAction(chatId, "ai_batch", {
      actions,
      context
    });

    await sendMessage(
      chatId,
      `RANCANGAN TINDAKAN TASKPILOT\n\n${preview}\n\nKonfirmasi semua tindakan ini?\nKirim YA untuk menjalankan atau BATAL untuk membatalkan.\n\nBerlaku selama 15 menit.`
    );
  } catch (error) {
    console.error("TaskPilot AI planning failed:", error);
    await sendMessage(chatId, error.message || "AI TaskPilot gagal menyiapkan permintaan. Coba jelaskan kembali.");
  }
}
