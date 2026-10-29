// Supabase のクライアント。キーは .env.local（手元）と Vercel の環境変数から読む（.env.example）。
// 最初に使うときに作るので、キーのないテストや CI でも読み込むだけなら失敗しない。
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Supabase がログイン状態を localStorage に保つときのキー */
export const SUPABASE_STORAGE_KEY = 'kazuolovers.supabase.auth'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (typeof url !== 'string' || url === '' || typeof anonKey !== 'string' || anonKey === '') {
    throw new Error(
      'VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY が設定されていません（.env.example を見て .env.local を作る）',
    )
  }
  client = createClient(url, anonKey, {
    auth: {
      // ログイン状態を端末（localStorage）に保ち、試合当日に再ログインを求めない（F-01）
      persistSession: true,
      storageKey: SUPABASE_STORAGE_KEY,
      autoRefreshToken: true,
      // メールのコードでログインするので、URL からは読まない
      detectSessionInUrl: false,
    },
  })
  return client
}
