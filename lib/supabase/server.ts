import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let client: ReturnType<typeof createClient<Database>> | undefined;

export function getSupabaseServerClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  client = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });

  return client;
}
