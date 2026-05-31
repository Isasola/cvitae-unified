import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

const getSiteUrl = () => {
  if (import.meta.env.PROD) return 'https://cvitae.lat'
  return 'http://localhost:5173'
}

export const auth = {
  signInWithMagicLink: async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    })
    return { error }
  },
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },
  getUser: async () => {
    const { data } = await supabase.auth.getUser()
    return data?.user || null
  },
  onAuthStateChange: (callback: (user: any) => void) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null)
    })
    return subscription
  },
}
