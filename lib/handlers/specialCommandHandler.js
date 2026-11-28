
import { config } from "../config/env.js";
import { sendMessage } from "../integrations/telegram.js";
import { getTasks } from "../services/taskService.js";
import { getReminders } from "../services/reminderService.js";
import {
  deleteAllTasks,
  deleteCompletedTasks,
  deleteAllReminders,
  deleteSentReminders
} from "../services/bulkDeleteService.js";
import {
  savePendingAction,
  getPendingAction,
  clearPendingAction
} from "../services/aiPendingService.js";

const actions = {
  "/deletealltasks": {
    type: "delete_all_tasks",
    label: "semua tugas",
    source: "tasks"
  },
  "/deleteallreminders": {
    type: "delete_all_reminders",
    label: "semua pengingat",
    source: "reminders"
  },
  "/deletecompleted": {
    type: "delete_completed_tasks",
    label: "tugas berstatus completed",
    source: "completed"
  },
  "/deletesentreminders": {
    type: "delete_sent_reminders",
    label: "pengingat berstatus sent",
    source: "sent"
  }
};

const bulkActionTypes = Object.values(actions).map(action => action.type);

function isConfirmation(text) {
  return /^(ya|iya|y|setuju|konfirmasi|oke|ok|gas)$/i.test(text.trim());
}

function isCancellation(text) {
  return /^(tidak|enggak|nggak|gak|ga|batal|cancel|no)$/i.test(text.trim());
}

async function getActionCount(source) {
  if (source === "tasks") {
    const tasks = await getTasks();
    return tasks.length;
  }

  if (source === "reminders") {
    const reminders = await getReminders();
    return reminders.length;
  }

  if (source === "completed") {
    const tasks = await getTasks();
    return tasks.filter(task => task.status === "completed").length;
  }

  if (source === "sent") {
    const reminders = await getReminders();
    return reminders.filter(reminder => reminder.status === "sent").length;
  }

  return 0;
}

async function requestBulkConfirmation(chatId, action) {
  const existing = await getPendingAction(chatId);

  if (existing) {
    await clearPendingAction(chatId);
    await sendMessage(chatId, "Konfirmasi sebelumnya dibatalkan.");
  }

  const count = await getActionCount(action.source);

  if (!count) {
    await sendMessage(chatId, `Tidak ada ${action.label} yang perlu dihapus.`);
    return;
  }

  await savePendingAction(chatId, action.type, {
    requested_count: count
  });

  await sendMessage(
    chatId,
    `KONFIRMASI PENGHAPUSAN\n\nTarget: ${action.label}\nJumlah saat ini: ${count}\n\nData akan dihapus permanen.\n\nKirim YA untuk menghapus atau BATAL untuk membatalkan.\nKonfirmasi berlaku selama 15 menit.`
  );
}

async function executeBulkDelete(chatId, actionType) {
  await clearPendingAction(chatId);

  try {
    let deleted = 0;
    let label = "";

    if (actionType === "delete_all_tasks") {
      deleted = await deleteAllTasks();
      label = "tugas";
    } else if (actionType === "delete_all_reminders") {
      deleted = await deleteAllReminders();
      label = "pengingat";
    } else if (actionType === "delete_completed_tasks") {
      deleted = await deleteCompletedTasks();
      label = "tugas completed";
    } else if (actionType === "delete_sent_reminders") {
      deleted = await deleteSentReminders();
      label = "pengingat sent";
    }

    await sendMessage(
      chatId,
      `Penghapusan berhasil!\n\nJumlah ${label} yang dihapus: ${deleted}`
    );
  } catch (error) {
    console.error("Bulk deletion failed:", error);
    await sendMessage(chatId, "Penghapusan gagal. Tidak semua data berhasil dihapus.");
  }
}

async function sendStatistics(chatId) {
  try {
    const [tasks, reminders] = await Promise.all([
      getTasks(),
      getReminders()
    ]);

    const taskCount = status =>
      tasks.filter(task => task.status === status).length;

    const reminderCount = status =>
      reminders.filter(reminder => reminder.status === status).length;

    await sendMessage(
      chatId,
      `STATISTIK TASKPILOT\n\nTUGAS\nTotal: ${tasks.length}\nPending: ${taskCount("pending")}\nIn progress: ${taskCount("in_progress")}\nCompleted: ${taskCount("completed")}\nCancelled: ${taskCount("cancelled")}\n\nPENGINGAT\nTotal: ${reminders.length}\nPending: ${reminderCount("pending")}\nProcessing: ${reminderCount("processing")}\nSent: ${reminderCount("sent")}\nFailed: ${reminderCount("failed")}`
    );
  } catch (error) {
    console.error("TaskPilot statistics failed:", error);
    await sendMessage(chatId, "Gagal mengambil statistik TaskPilot.");
  }
}

export async function handleSpecialUpdate(update) {
  const message = update.message;

  if (!message?.from?.id || !message?.chat?.id) return false;
  if (String(message.from.id) !== config.ownerTelegramId) return false;

  const text = message.text?.trim();
  if (!text) return false;

  const chatId = message.chat.id;
  const [rawCommand] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();

  if (command === "/help") {
    await sendMessage(
      chatId,
      "TASKPILOT COMMANDS\n\n/add Judul tugas\n/add YYYY-MM-DD HH:MM Judul tugas\n/tasks\n/today\n/tomorrow\n/week\n/done ID\n/delete ID\n/edit ID title|description|priority|due_at nilai\n/categories\n/categoryadd Nama kategori\n/category TASK_ID CATEGORY_ID\n/categoryedit CATEGORY_ID Nama baru\n/categorydelete CATEGORY_ID\n/categoryremove TASK_ID\n/remind YYYY-MM-DD HH:MM Judul\n/reminders\n/remindedit ID title Judul baru\n/remindedit ID time YYYY-MM-DD HH:MM\n/reminddelete ID\n\nPERINTAH SPESIAL\n/deletealltasks\n/deleteallreminders\n/deletecompleted\n/deletesentreminders\n/stats\n\nKirim pesan biasa untuk menggunakan AI TaskPilot."
    );
    return true;
  }

  if (command === "/stats") {
    await sendStatistics(chatId);
    return true;
  }

  if (actions[command]) {
    try {
      await requestBulkConfirmation(chatId, actions[command]);
    } catch (error) {
      console.error("Bulk deletion preparation failed:", error);
      await sendMessage(chatId, "Gagal menyiapkan penghapusan.");
    }
    return true;
  }

  const pending = await getPendingAction(chatId);

  if (!pending || !bulkActionTypes.includes(pending.action_type)) {
    return false;
  }

  if (isConfirmation(text)) {
    await executeBulkDelete(chatId, pending.action_type);
    return true;
  }

  if (isCancellation(text)) {
    await clearPendingAction(chatId);
    await sendMessage(chatId, "Penghapusan dibatalkan. Tidak ada data yang dihapus.");
    return true;
  }

  await clearPendingAction(chatId);
  await sendMessage(chatId, "Konfirmasi penghapusan dibatalkan karena ada pesan baru.");

  return false;
}
