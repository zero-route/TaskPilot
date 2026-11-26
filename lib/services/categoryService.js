
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
