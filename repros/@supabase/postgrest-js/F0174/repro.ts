// F0174: @supabase/postgrest-js 2.119.0. rpc() with count (or head with an object argument) replaces the client Prefer header in place of adding to it.
//
// dist/index.mjs:4024-4025 (rpc) uses `headers.set("Prefer", ...)`, which
// drops each Prefer preference given in the client headers (for example
// `timezone=...` or `tx=rollback`). The table methods add to the header with
// `headers.append("Prefer", ...)` (dist/index.mjs:2881, 3016, 3257, 3431, 3574),
// and so does rpc() without count. So one client sends tx=rollback on every
// call except an rpc() with count, which then commits.
import { PostgrestClient } from '@supabase/postgrest-js'

type Call = { url: string; method: string; headers: Record<string, string> }
const calls: Call[] = []
const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  calls.push({ url: String(input), method: String(init.method), headers: (init.headers ?? {}) as Record<string, string> })
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/1' } })
}

const client = new PostgrestClient('https://example.supabase.co/rest/v1', {
  fetch: fakeFetch,
  headers: { Prefer: 'tx=rollback' },
})

const runs: [string, () => PromiseLike<unknown>][] = [
  ["from('t').select('*', { count: 'exact' })", () => client.from('t').select('*', { count: 'exact' })],
  ["rpc('f', { a: 1 })", () => client.rpc('f', { a: 1 })],
  ["rpc('f', { a: 1 }, { count: 'exact' })", () => client.rpc('f', { a: 1 }, { count: 'exact' })],
  ["rpc('f', { a: { b: 1 } }, { head: true })", () => client.rpc('f', { a: { b: 1 } }, { head: true })],
]

let bug = false
for (const [label, run] of runs) {
  calls.length = 0
  await run()
  const prefer = calls[0].headers['prefer'] ?? '(none)'
  const kept = prefer.includes('tx=rollback')
  if (!kept) bug = true
  console.log(`${label.padEnd(44)} Prefer: ${prefer.padEnd(34)} ${kept ? 'OK' : 'MISMATCH: client preference lost'}`)
}
console.log('expected: every request keeps the client preference tx=rollback and adds its own preferences')

if (bug) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
