
import { supabase } from "../integrations/supabase.js";

export async function savePendingAction(chatId, actionType, payload) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("ai_pending_actions")
    .upsert({
      chat_id: String(chatId),
      action_type: actionType,
      payload,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    }, {
      onConflict: "chat_id"
    })
    .select()
    .single();

  if (error) throw new Error("Failed to save pending action");

  return data;
}

export async function getPendingAction(chatId) {
  const { data, error } = await supabase
    .from("ai_pending_actions")
    .select("*")
    .eq("chat_id", String(chatId))
    .maybeSingle();

  if (error) throw new Error("Failed to retrieve pending action");

  if (!data) return null;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await clearPendingAction(chatId);
    return null;
  }

  return data;
}

export async function clearPendingAction(chatId) {
  const { error } = await supabase
    .from("ai_pending_actions")
    .delete()
    .eq("chat_id", String(chatId));

  if (error) throw new Error("Failed to clear pending action");
}
