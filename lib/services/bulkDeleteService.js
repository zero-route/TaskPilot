
import { supabase } from "../integrations/supabase.js";

export async function deleteAllTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .not("id", "is", null)
    .select("id");

  if (error) throw new Error("Failed to delete all tasks");

  return data.length;
}

export async function deleteCompletedTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("status", "completed")
    .select("id");

  if (error) throw new Error("Failed to delete completed tasks");

  return data.length;
}

export async function deleteAllReminders() {
  const { data, error } = await supabase
    .from("reminders")
    .delete()
    .not("id", "is", null)
    .select("id");

  if (error) throw new Error("Failed to delete all reminders");

  return data.length;
}

export async function deleteSentReminders() {
  const { data, error } = await supabase
    .from("reminders")
    .delete()
    .eq("status", "sent")
    .select("id");

  if (error) throw new Error("Failed to delete sent reminders");

  return data.length;
}
