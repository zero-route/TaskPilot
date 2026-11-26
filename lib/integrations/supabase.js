
import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);
