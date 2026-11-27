 
import { supabase } from "../integrations/supabase.js";

const priorities = ["low", "medium", "high", "urgent"];
const statuses = ["pending", "in_progress", "completed", "cancelled"];

function getWitaDate(offset = 0) {
  const now = new Date();
  const date = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
}

async function getTasksByDate(date) {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const { data, error } = await supabase
    .from("tasks")
    .select("*, categories(id, name)")
    .gte("due_at", start.toISOString())
    .lt("due_at", end.toISOString())
    .order("due_at", { ascending: true });

  if (error) {
    throw new Error("Failed to retrieve scheduled tasks");
  }

  return data;
}

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

export async function getTodayTasks() {
  return getTasksByDate(getWitaDate());
}

export async function getTomorrowTasks() {
  return getTasksByDate(getWitaDate(1));
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

export async function updateTask(id, updates) {
  const allowedFields = [
    "title",
    "description",
    "category_id",
    "due_at",
    "priority",
    "status"
  ];

  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowedFields.includes(key))
  );

  if (Object.keys(cleanUpdates).length === 0) {
    throw new Error("No valid fields to update");
  }

  if (cleanUpdates.title !== undefined && !cleanUpdates.title.trim()) {
    throw new Error("Task title cannot be empty");
  }

  if (cleanUpdates.priority && !priorities.includes(cleanUpdates.priority)) {
    throw new Error("Invalid task priority");
  }

  if (cleanUpdates.status && !statuses.includes(cleanUpdates.status)) {
    throw new Error("Invalid task status");
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(cleanUpdates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error("Failed to update task");
  }

  return data;
}

export async function completeTask(id) {
  return updateTask(id, { status: "completed" });
}

export async function deleteTask(id) {
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error("Failed to delete task");
  }

  return Boolean(data);
}
