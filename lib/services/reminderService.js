
import { supabase } from "../integrations/supabase.js";

export async function createReminder({
  title,
  scheduled_at,
  task_id = null
}) {
  const normalizedTitle = title?.trim();
  const scheduledDate = new Date(scheduled_at);

  if (!normalizedTitle) {
    throw new Error("Reminder title cannot be empty");
  }

  if (!scheduled_at || Number.isNaN(scheduledDate.getTime())) {
    throw new Error("Invalid reminder date");
  }

  if (scheduledDate.getTime() <= Date.now()) {
    throw new Error("Reminder time must be in the future");
  }

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      title: normalizedTitle,
      scheduled_at: scheduledDate.toISOString(),
      task_id
    })
    .select()
    .single();

  if (error) {
    throw new Error("Failed to create reminder");
  }

  return data;
}

export async function getReminders(status = null) {
  let query = supabase
    .from("reminders")
    .select("*")
    .order("scheduled_at", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Failed to retrieve reminders");
  }

  return data;
}

export async function getReminderById(id) {
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to retrieve reminder");
  }

  return data;
}

export async function updateReminder(id, updates) {
  const allowedFields = ["title", "scheduled_at", "task_id"];

  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowedFields.includes(key))
  );

  if (Object.keys(cleanUpdates).length === 0) {
    throw new Error("No valid fields to update");
  }

  if (cleanUpdates.title !== undefined) {
    cleanUpdates.title = cleanUpdates.title.trim();

    if (!cleanUpdates.title) {
      throw new Error("Reminder title cannot be empty");
    }
  }

  if (cleanUpdates.scheduled_at !== undefined) {
    const scheduledDate = new Date(cleanUpdates.scheduled_at);

    if (
      Number.isNaN(scheduledDate.getTime()) ||
      scheduledDate.getTime() <= Date.now()
    ) {
      throw new Error("Invalid reminder date");
    }

    cleanUpdates.scheduled_at = scheduledDate.toISOString();
  }

  cleanUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("reminders")
    .update(cleanUpdates)
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    throw new Error("Failed to update reminder");
  }

  return data;
}

export async function deleteReminder(id) {
  const { data, error } = await supabase
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error("Failed to delete reminder");
  }

  return Boolean(data);
}

export async function claimDueReminders(limit = 20) {
  const { data, error } = await supabase.rpc("claim_due_reminders", {
    p_limit: limit
  });

  if (error) {
    throw new Error("Failed to claim due reminders");
  }

  return data;
}

export async function markReminderSent(id) {
  const { data, error } = await supabase
    .from("reminders")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      claimed_at: null,
      next_attempt_at: null,
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("status", "processing")
    .select()
    .maybeSingle();

  if (error) {
    throw new Error("Failed to mark reminder as sent");
  }

  return data;
}

export async function scheduleReminderRetry(id, attemptCount, errorMessage) {
  const delays = [1, 5, 15, 60];
  const now = new Date();

  const updates = {
    claimed_at: null,
    last_error: String(errorMessage || "Unknown error").slice(0, 1000),
    updated_at: now.toISOString()
  };

  if (attemptCount >= 5) {
    updates.status = "failed";
    updates.next_attempt_at = null;
  } else {
    updates.status = "pending";
    updates.next_attempt_at = new Date(
      now.getTime() + delays[Math.max(0, attemptCount - 1)] * 60000
    ).toISOString();
  }

  const { data, error } = await supabase
    .from("reminders")
    .update(updates)
    .eq("id", id)
    .eq("status", "processing")
    .select()
    .maybeSingle();

  if (error) {
    throw new Error("Failed to schedule reminder retry");
  }

  return data;
}
