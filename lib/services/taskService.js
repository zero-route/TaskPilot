
import { supabase } from "../integrations/supabase.js";

const priorities = ["low", "medium", "high", "urgent"];
const statuses = ["pending", "in_progress", "completed", "cancelled"];

export async function createTask({
  title,
  description = null,
  category_id = null,
  due_at = null,
  priority = "medium"
}) {
  const normalizedTitle = title?.trim();

  if (!normalizedTitle) {
    throw new Error("Task title cannot be empty");
  }

  if (!priorities.includes(priority)) {
    throw new Error("Invalid task priority");
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: normalizedTitle,
      description,
      category_id,
      due_at,
      priority
    })
    .select()
    .single();

  if (error) {
    throw new Error("Failed to create task");
  }

  return data;
}

export async function getTasks(status = null) {
  let query = supabase
    .from("tasks")
    .select("*, categories(id, name)")
    .order("created_at", { ascending: false });

  if (status) {
    if (!statuses.includes(status)) {
      throw new Error("Invalid task status");
    }

    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Failed to retrieve tasks");
  }

  return data;
}

export async function getTaskById(id) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, categories(id, name)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to retrieve task");
  }

  return data;
}
