
import { sendMessage } from "../integrations/telegram.js";
import { parseAIRequest, resolveAIUpdateTarget } from "../services/aiService.js";
import {
  createTask,
  getTasks,
  updateTask
} from "../services/taskService.js";
import {
  createReminder,
  getReminders,
  updateReminder
} from "../services/reminderService.js";
import {
  savePendingAction,
  getPendingAction,
  clearPendingAction
} from "../services/aiPendingService.js";

function isValidDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return false;
  }

  const parsed = new Date(`${date}T${time}:00+08:00`);

  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().startsWith(`${date}T${time}:`);
}

function makeDateTime(date, time) {
  const selectedTime = time || "08:00";

  if (!date || !isValidDateTime(date, selectedTime)) {
    throw new Error("Tanggal atau waktu tidak valid.");
  }

  return `${date}T${selectedTime}:00+08:00`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Makassar"
  }).format(new Date(value));
}

function isConfirmation(text) {
  return /^(ya|iya|y|setuju|konfirmasi|oke|ok|gas|lanjut)$/i.test(text.trim());
}

function isCancellation(text) {
  return /^(tidak|enggak|nggak|gak|ga|batal|cancel|no)$/i.test(text.trim());
}

async function requestConfirmation(chatId, actionType, payload, preview) {
  await savePendingAction(chatId, actionType, payload);

  await sendMessage(
    chatId,
    `${preview}\n\nKonfirmasi tindakan ini?\nKirim "ya" untuk melanjutkan atau "batal" untuk membatalkan.\n\nKonfirmasi berlaku selama 15 menit.`
  );
}

function formatTaskList(tasks) {
  if (!tasks.length) return "Belum ada tugas.";

  const list = tasks.slice(0, 20).map((task, index) => {
    const deadline = task.due_at
      ? formatDateTime(task.due_at)
      : "Tidak ada";

    return `${index + 1}. ${task.title}\nID: ${task.id}\nDeadline: ${deadline}\nPrioritas: ${task.priority}\nStatus: ${task.status}\nKategori: ${task.categories?.name ?? "Belum ada"}`;
  });

  const remaining = tasks.length > 20
    ? `\n\nDan ${tasks.length - 20} tugas lainnya.`
    : "";

  return `DAFTAR TUGAS\n\n${list.join("\n\n")}${remaining}`;
}

function formatReminderList(reminders) {
  if (!reminders.length) return "Belum ada pengingat.";

  const list = reminders.slice(0, 20).map((reminder, index) => {
    return `${index + 1}. ${reminder.title}\nID: ${reminder.id}\nWaktu: ${formatDateTime(reminder.scheduled_at)}\nStatus: ${reminder.status}`;
  });

  const remaining = reminders.length > 20
    ? `\n\nDan ${reminders.length - 20} pengingat lainnya.`
    : "";

  return `DAFTAR PENGINGAT\n\n${list.join("\n\n")}${remaining}`;
}

function buildTaskUpdates(source) {
  const updates = {};

  if (typeof source.title === "string" && source.title.trim()) {
    updates.title = source.title.trim();
  }

  if (typeof source.description === "string" || source.description === null) {
    if (Object.hasOwn(source, "description")) {
      updates.description = source.description;
    }
  }

  if (Object.hasOwn(source, "priority")) {
    if (!["low", "medium", "high", "urgent"].includes(source.priority)) {
      throw new Error("Prioritas harus low, medium, high, atau urgent.");
    }

    updates.priority = source.priority;
  }

  if (source.date || source.time) {
    if (!source.date) {
      throw new Error("Tanggal deadline belum disebutkan.");
    }

    updates.due_at = makeDateTime(source.date, source.time);
  }

  if (!Object.keys(updates).length) {
    throw new Error("Tidak ditemukan perubahan tugas yang valid.");
  }

  return updates;
}

function buildReminderUpdates(source) {
  const updates = {};

  if (typeof source.title === "string" && source.title.trim()) {
    updates.title = source.title.trim();
  }

  if (source.date || source.time) {
    if (!source.date) {
      throw new Error("Tanggal pengingat belum disebutkan.");
    }

    updates.scheduled_at = makeDateTime(source.date, source.time);
  }

  if (!Object.keys(updates).length) {
    throw new Error("Tidak ditemukan perubahan pengingat yang valid.");
  }

  return updates;
}

function formatChanges(updates) {
  const labels = {
    title: "Judul",
    description: "Deskripsi",
    priority: "Prioritas",
    due_at: "Deadline",
    scheduled_at: "Waktu"
  };

  return Object.entries(updates).map(([key, value]) => {
    let formattedValue = value ?? "Kosong";

    if (key === "due_at" || key === "scheduled_at") {
      formattedValue = formatDateTime(value);
    }

    return `${labels[key] || key}: ${formattedValue}`;
  }).join("\n");
}

async function executePendingAction(chatId, pending) {
  const { action_type: actionType, payload } = pending;

  await clearPendingAction(chatId);

  try {
    if (actionType === "create_task") {
      const task = await createTask(payload);
      const deadline = task.due_at
        ? `\nDeadline: ${formatDateTime(task.due_at)}`
        : "\nDeadline: Tidak ada";

      await sendMessage(
        chatId,
        `Tugas berhasil dibuat!\n\nJudul: ${task.title}\nPrioritas: ${task.priority}${deadline}\nID: ${task.id}`
      );
      return;
    }

    if (actionType === "create_reminder") {
      const reminder = await createReminder(payload);

      await sendMessage(
        chatId,
        `Pengingat berhasil dibuat!\n\nJudul: ${reminder.title}\nWaktu: ${formatDateTime(reminder.scheduled_at)}\nStatus: ${reminder.status}\nID: ${reminder.id}`
      );
      return;
    }

    if (actionType === "update_task") {
      const task = await updateTask(payload.id, payload.updates);

      await sendMessage(
        chatId,
        task
          ? `Tugas berhasil diperbarui!\n\nJudul: ${task.title}\nPrioritas: ${task.priority}\nDeadline: ${task.due_at ? formatDateTime(task.due_at) : "Tidak ada"}`
          : "Tugas tidak ditemukan."
      );
      return;
    }

    if (actionType === "update_reminder") {
      const reminder = await updateReminder(payload.id, payload.updates);

      await sendMessage(
        chatId,
        reminder
          ? `Pengingat berhasil diperbarui!\n\nJudul: ${reminder.title}\nWaktu: ${formatDateTime(reminder.scheduled_at)}\nStatus: ${reminder.status}`
          : "Pengingat tidak ditemukan atau statusnya bukan pending."
      );
      return;
    }

    await sendMessage(chatId, "Jenis tindakan tidak dikenal.");
  } catch (error) {
    await sendMessage(
      chatId,
      error.message === "Reminder time must be in the future" ||
      error.message === "Invalid reminder date"
        ? "Waktu pengingat harus berada di masa depan."
        : "Tindakan gagal dijalankan. Periksa kembali data dan coba lagi."
    );
  }
}

async function findTarget(message, intent, target, records) {
  if (!target) return null;

  const normalized = target.toLocaleLowerCase("id-ID").trim();

  const exactMatches = records.filter(record =>
    record.id === target ||
    record.title.toLocaleLowerCase("id-ID").trim() === normalized
  );

  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;

  const targetId = await resolveAIUpdateTarget(
    message,
    intent,
    target,
    records
  );

  return records.find(record => record.id === targetId) || null;
}

export async function handleAIMessage(chatId, message) {
  const pending = await getPendingAction(chatId);

  if (pending) {
    if (isConfirmation(message)) {
      await executePendingAction(chatId, pending);
      return;
    }

    if (isCancellation(message)) {
      await clearPendingAction(chatId);
      await sendMessage(chatId, "Tindakan dibatalkan.");
      return;
    }

    await clearPendingAction(chatId);
    await sendMessage(chatId, "Permintaan konfirmasi sebelumnya dibatalkan karena ada permintaan baru.");
  } else if (isConfirmation(message) || isCancellation(message)) {
    await sendMessage(chatId, "Tidak ada tindakan yang sedang menunggu konfirmasi.");
    return;
  }

  let parsed;

  try {
    parsed = await parseAIRequest(message);
  } catch {
    await sendMessage(chatId, "AI TaskPilot sedang tidak dapat memproses pesan. Coba lagi.");
    return;
  }

  if (parsed.intent === "list_tasks") {
    try {
      const tasks = await getTasks();
      await sendMessage(chatId, formatTaskList(tasks));
    } catch {
      await sendMessage(chatId, "Gagal mengambil daftar tugas.");
    }
    return;
  }

  if (parsed.intent === "list_reminders") {
    try {
      const reminders = await getReminders();
      await sendMessage(chatId, formatReminderList(reminders));
    } catch {
      await sendMessage(chatId, "Gagal mengambil daftar pengingat.");
    }
    return;
  }

  if (parsed.intent === "create_task") {
    if (!parsed.title) {
      await sendMessage(chatId, "Judul tugas belum disebutkan.");
      return;
    }

    if (parsed.time && !parsed.date) {
      await sendMessage(chatId, "Tanggal deadline belum disebutkan.");
      return;
    }

    let dueAt = null;

    try {
      if (parsed.date) {
        dueAt = makeDateTime(parsed.date, parsed.time);
      }
    } catch {
      await sendMessage(chatId, "Tanggal atau waktu deadline tidak valid.");
      return;
    }

    const payload = {
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      due_at: dueAt
    };

    const deadline = dueAt
      ? formatDateTime(dueAt)
      : "Tidak ada";

    await requestConfirmation(
      chatId,
      "create_task",
      payload,
      `RANCANGAN TUGAS\n\nJudul: ${payload.title}\nPrioritas: ${payload.priority}\nDeadline: ${deadline}`
    );
    return;
  }

  if (parsed.intent === "create_reminder") {
    if (!parsed.title || !parsed.date) {
      await sendMessage(chatId, "Judul dan tanggal pengingat diperlukan. Contoh: Ingatkan saya belajar besok.");
      return;
    }

    if (parsed.time && !parsed.date) {
      await sendMessage(chatId, "Tanggal pengingat belum disebutkan.");
      return;
    }

    let scheduledAt;

    try {
      scheduledAt = makeDateTime(parsed.date, parsed.time);
    } catch {
      await sendMessage(chatId, "Tanggal atau waktu pengingat tidak valid.");
      return;
    }

    const payload = {
      title: parsed.title,
      scheduled_at: scheduledAt
    };

    await requestConfirmation(
      chatId,
      "create_reminder",
      payload,
      `RANCANGAN PENGINGAT\n\nJudul: ${payload.title}\nWaktu: ${formatDateTime(scheduledAt)}`
    );
    return;
  }

  if (parsed.intent === "update_task") {
    try {
      const updates = buildTaskUpdates(parsed.updates);
      const tasks = await getTasks();
      const target = await findTarget(message, parsed.intent, parsed.target, tasks);

      if (!target) {
        await sendMessage(chatId, "Tugas yang dimaksud belum bisa dipastikan. Sebutkan judul atau ID tugas dengan lebih jelas.");
        return;
      }

      const payload = {
        id: target.id,
        updates
      };

      await requestConfirmation(
        chatId,
        "update_task",
        payload,
        `KONFIRMASI PENYESUAIAN TUGAS\n\nTugas: ${target.title}\nID: ${target.id}\n\n${formatChanges(updates)}`
      );
    } catch (error) {
      await sendMessage(chatId, error.message || "Gagal menyiapkan perubahan tugas.");
    }
    return;
  }

  if (parsed.intent === "update_reminder") {
    try {
      const updates = buildReminderUpdates(parsed.updates);
      const reminders = await getReminders();
      const target = await findTarget(message, parsed.intent, parsed.target, reminders);

      if (!target) {
        await sendMessage(chatId, "Pengingat yang dimaksud belum bisa dipastikan. Sebutkan judul atau ID pengingat dengan lebih jelas.");
        return;
      }

      if (target.status !== "pending") {
        await sendMessage(chatId, "Hanya pengingat berstatus pending yang bisa disesuaikan.");
        return;
      }

      const payload = {
        id: target.id,
        updates
      };

      await requestConfirmation(
        chatId,
        "update_reminder",
        payload,
        `KONFIRMASI PENYESUAIAN PENGINGAT\n\nPengingat: ${target.title}\nID: ${target.id}\n\n${formatChanges(updates)}`
      );
    } catch (error) {
      await sendMessage(chatId, error.message || "Gagal menyiapkan perubahan pengingat.");
    }
    return;
  }

  await sendMessage(
    chatId,
    parsed.response || "Saya belum memahami permintaan tersebut. Coba jelaskan dengan lebih spesifik."
  );
}