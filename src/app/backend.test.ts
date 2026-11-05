import { describe, expect, it } from 'vitest'
import { hasSupabaseKeys } from './backend.ts'

describe('hasSupabaseKeys', () => {
  it('URL とキーの両方があるときだけ本物につなぐ', () => {
    expect(hasSupabaseKeys({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toBe(true)
    expect(hasSupabaseKeys({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: '' })).toBe(false)
    expect(hasSupabaseKeys({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBe(false)
    expect(hasSupabaseKeys({})).toBe(false)
  })
})
