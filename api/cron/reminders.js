
import { timingSafeEqual } from "node:crypto";
import { config } from "../../lib/config/env.js";
import { sendMessage } from "../../lib/integrations/telegram.js";
import {
  claimDueReminders,
  markReminderSent,
  scheduleReminderRetry
} from "../../lib/services/reminderService.js";

function verifyCronSecret(req) {
  const secret = process.env.CRON_SECRET;

  if (!secret) return false;

  const authorization = req.headers.authorization;

  if (typeof authorization !== "string") return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyCronSecret(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const reminders = await claimDueReminders(20);
    let sent = 0;
    let failed = 0;

    for (const reminder of reminders) {
      const formattedDate = new Intl.DateTimeFormat("id-ID", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Makassar"
      }).format(new Date(reminder.scheduled_at));

      const message = `⏰ PENGINGAT TASKPILOT\n\n${reminder.title}\n\nJadwal: ${formattedDate}`;

      try {
        await sendMessage(config.ownerTelegramId, message);
      } catch (error) {
        try {
          await scheduleReminderRetry(
            reminder.id,
            reminder.attempt_count,
            error.message
          );
        } catch {
          console.error("Reminder retry scheduling failed");
        }

        failed++;
        continue;
      }

      try {
        await markReminderSent(reminder.id);
        sent++;
      } catch {
        console.error("Reminder sent status update failed");
        failed++;
      }
    }

    return res.status(200).json({
      ok: true,
      processed: reminders.length,
      sent,
      failed
    });
  } catch {
    console.error("Reminder cron processing failed");
    return res.status(500).json({
      ok: false,
      error: "Reminder processing failed"
    });
  }
}
