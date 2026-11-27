
import { supabase } from "../integrations/supabase.js";

export async function getCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    throw new Error("Failed to retrieve categories");
  }

  return data;
}

export async function createCategory(name) {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Category name cannot be empty");
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({ name: normalizedName })
    .select()
    .single();

  if (error) {
    throw new Error("Failed to create category");
  }

  return data;
}

export async function updateCategory(id, name) {
  const normalizedName = name.trim();

  if (!id || !normalizedName) {
    throw new Error("Category ID and name are required");
  }

  const { data, error } = await supabase
    .from("categories")
    .update({ name: normalizedName })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error("Failed to update category");
  }

  return data;
}

export async function deleteCategory(id) {
  if (!id) {
    throw new Error("Category ID is required");
  }

  const { count, error: taskError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (taskError) {
    throw new Error("Failed to check category usage");
  }

  if (count > 0) {
    throw new Error("Category is still assigned to tasks");
  }

  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error("Failed to delete category");
  }

  return Boolean(data);
}
