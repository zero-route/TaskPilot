
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
