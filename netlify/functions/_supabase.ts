import { createClient } from "@supabase/supabase-js"
import ws from "ws"

export function makeSupabaseAdmin() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, {
    global: { fetch },
    realtime: { transport: ws as any },
    auth: { persistSession: false },
  })
}

export function makeSupabaseAnon() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!
  const key = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  return createClient(url, key, {
    global: { fetch },
    realtime: { transport: ws as any },
    auth: { persistSession: false },
  })
}
