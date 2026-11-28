
import { supabase } from "../integrations/supabase.js";

export async function resetTaskPilotData() {
  const { data, error } = await supabase.rpc("reset_taskpilot_data");

  if (error) {
    throw new Error(`TaskPilot reset failed: ${error.message}`);
  }

  return data;
}
