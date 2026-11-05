// 本物（Supabase）につなぐか、デモで動かすか。
// キー（VITE_SUPABASE_URL・VITE_SUPABASE_ANON_KEY）がなければデモにする。キーのない手元・テスト・発表の予備で使う。
import type { RecordRepository } from '../contracts/index.ts'
import { createDemoMatchSource, type MatchSource } from '../features/record/matchSource.ts'
import { DEMO_MATCH, DEMO_PRACTICE, DEMO_PRACTICE_SET, DEMO_SETS } from '../features/record/demo.ts'
import { auth, type Auth } from '../lib/data/auth.ts'
import { createFakeRecordRepository } from '../lib/data/fakeRecordRepository.ts'
import { recordRepository } from '../lib/data/supabaseRecordStore.ts'
import { teamData, type TeamData } from '../lib/data/teamData.ts'
import { loadDemoTeam, loadTeamFrom, type LoadTeam } from './analysisData.ts'

export type Backend =
  | { kind: 'demo'; repo: RecordRepository; source: MatchSource; loadTeam: LoadTeam }
  | {
      kind: 'supabase'
      repo: RecordRepository
      source: MatchSource
      loadTeam: LoadTeam
      teamData: TeamData
      auth: Auth
    }

const filled = (v: unknown): boolean => typeof v === 'string' && v !== ''

export const hasSupabaseKeys = (env: Record<string, unknown>): boolean =>
  filled(env.VITE_SUPABASE_URL) && filled(env.VITE_SUPABASE_ANON_KEY)

export function createDemoBackend(): Backend {
  return {
    kind: 'demo',
    // セットは「次のセットへ」で1つずつ出すが、フェイクには5セット分の id を先に渡しておく
    repo: createFakeRecordRepository({
      [DEMO_MATCH.id]: DEMO_SETS.map((s) => s.id),
      [DEMO_PRACTICE.id]: [DEMO_PRACTICE_SET.id],
    }),
    source: createDemoMatchSource(),
    loadTeam: loadDemoTeam,
  }
}

export const backend: Backend = hasSupabaseKeys(import.meta.env)
  ? {
      kind: 'supabase',
      repo: recordRepository,
      source: teamData,
      loadTeam: loadTeamFrom(teamData),
      teamData,
      auth,
    }
  : createDemoBackend()
