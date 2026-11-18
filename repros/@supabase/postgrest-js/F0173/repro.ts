// F0173: @supabase/postgrest-js 2.119.0. eq()/neq()/match() accept array and JSON column values by type but send them as "a,b" and "[object Object]".
//
// dist/index.mjs:1541-1543 (eq), 1596-1598 (neq) and 1782-1786 (match) send
// `eq.${value}`. The declared value type is the column type
// (ResolveFilterValue -> Row[ColumnName], dist/index.d.mts:1804 and 1859), so
// for a text[] column `string[]` type-checks and for a jsonb column an object
// type-checks. At run time String(['a','b']) is "a,b", which Postgres rejects
// as a malformed array literal for `tags = 'a,b'`, and an object becomes
// "[object Object]". The array literal is {"a","b"} and the jsonb text is JSON.
// `npx tsc --noEmit` on this file passes (see tsconfig.repro.json).
import { PostgrestClient } from '@supabase/postgrest-js'

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
type Database = {
  public: {
    Tables: {
      docs: {
        Row: { id: number; tags: string[]; meta: Json }
        Insert: { id?: number; tags: string[]; meta: Json }
        Update: { id?: number; tags?: string[]; meta?: Json }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

const calls: string[] = []
const fakeFetch = async (input: string | URL | Request, _init: RequestInit = {}) => {
  calls.push(String(input))
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
}

const client = new PostgrestClient<Database>('https://example.supabase.co/rest/v1', { fetch: fakeFetch })

await client.from('docs').select('id').eq('tags', ['a', 'b'])
await client.from('docs').select('id').neq('meta', { plan: 'pro' })
await client.from('docs').select('id').match({ tags: ['a', 'b'] })

const sent = calls.map((u) => [...new URL(u).searchParams].filter(([k]) => k !== 'select').map(([k, v]) => `${k}=${v}`).join('&'))
const expected = ['tags=eq.{"a","b"}', 'meta=neq.{"plan":"pro"}', 'tags=eq.{"a","b"}']
let bug = false
for (let i = 0; i < sent.length; i++) {
  const bad = sent[i].endsWith('.a,b') || sent[i].includes('[object Object]')
  if (bad) bug = true
  console.log(`observed: ${sent[i].padEnd(28)} expected (or equal): ${expected[i]}  ${bad ? 'MISMATCH' : 'OK'}`)
}
console.log('Postgres for `tags = \'a,b\'` on text[]: ERROR malformed array literal: "a,b" DETAIL: Array value must start with "{" or dimension information.')

if (bug) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
