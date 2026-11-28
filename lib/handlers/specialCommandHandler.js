
import { timingSafeEqual } from "node:crypto";
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
import { resetTaskPilotData } from "../services/resetService.js";
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

function verifyAdminKey(received) {
  const expected = Buffer.from(config.adminKey);
  const actual = Buffer.from(received);

  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

async function getActionCount(source) {
  if (source === "tasks") {
    return (await getTasks()).length;
  }

  if (source === "reminders") {
    return (await getReminders()).length;
  }

  if (source === "completed") {
    return (await getTasks()).filter(task => task.status === "completed").length;
  }

  if (source === "sent") {
    return (await getReminders()).filter(reminder => reminder.status === "sent").length;
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

    await sendMessage(chatId, `Penghapusan berhasil!\n\nJumlah ${label} yang dihapus: ${deleted}`);
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

async function executeFullReset(chatId) {
  await clearPendingAction(chatId);

  try {
    const result = await resetTaskPilotData();

    await sendMessage(
      chatId,
      `RESET TASKPILOT BERHASIL\n\nTugas: ${result.tasks}\nPengingat: ${result.reminders}\nKategori: ${result.categories}\nRiwayat aktivitas: ${result.activity_logs}\nPenggunaan AI: ${result.ai_usage}\nPengaturan: ${result.user_settings}\nAksi tertunda: ${result.ai_pending_actions}\n\nSeluruh data tersebut berhasil dihapus.`
    );
  } catch (error) {
    console.error("TaskPilot full reset failed:", error);
    await sendMessage(
      chatId,
      "RESET GAGAL\n\nTidak ada perubahan yang diterapkan karena transaksi database dibatalkan."
    );
  }
}

async function handleResetPending(chatId, text, pending) {
  if (isCancellation(text)) {
    await clearPendingAction(chatId);
    await sendMessage(chatId, "Reset dibatalkan. Tidak ada data yang dihapus.");
    return true;
  }

  if (pending.action_type === "reset_all_auth") {
    if (!verifyAdminKey(text)) {
      await clearPendingAction(chatId);
      await sendMessage(chatId, "ADMIN_KEY salah. Proses reset dibatalkan.");
      return true;
    }

    await savePendingAction(chatId, "reset_all_confirm", {
      verified: true
    });

    await sendMessage(
      chatId,
      "VERIFIKASI ADMIN BERHASIL\n\nSemua data TaskPilot akan dihapus permanen.\n\nKirim RESET untuk melanjutkan atau BATAL untuk membatalkan.\nKonfirmasi berlaku selama 15 menit."
    );

    return true;
  }

  if (pending.action_type === "reset_all_confirm") {
    if (text !== "RESET") {
      await clearPendingAction(chatId);
      await sendMessage(chatId, "Konfirmasi reset tidak cocok. Proses dibatalkan.");
      return true;
    }

    await executeFullReset(chatId);
    return true;
  }

  return false;
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

  const pending = await getPendingAction(chatId);

  if (pending?.action_type === "reset_all_auth" || pending?.action_type === "reset_all_confirm") {
    if (command.startsWith("/") && command !== "/resetall") {
      await clearPendingAction(chatId);
      await sendMessage(chatId, "Proses reset dibatalkan karena ada perintah baru.");
      return false;
    }

    if (command !== "/resetall") {
      return handleResetPending(chatId, text, pending);
    }
  }

  if (command === "/resetall") {
    if (pending) await clearPendingAction(chatId);

    await savePendingAction(chatId, "reset_all_auth", {
      requested_at: new Date().toISOString()
    });

    await sendMessage(
      chatId,
      "VERIFIKASI ADMIN\n\nMasukkan ADMIN_KEY untuk melanjutkan reset seluruh data TaskPilot.\n\nKirim BATAL jika ingin membatalkan."
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
