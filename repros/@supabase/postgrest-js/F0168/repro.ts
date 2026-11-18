// F0168: @supabase/postgrest-js 2.119.0. A 404 reply with an empty body (every HEAD 404, e.g. a missing table) becomes success with status 204 and count null.
//
// dist/index.mjs:522-526 (processResponse): when a non-2xx body is not JSON,
// `if (res.status === 404 && body === "")` sets status 204 "No Content" and
// leaves error null. The source calls this a workaround for
// supabase/postgrest-js#295. A reply to HEAD never has a body (RFC 9110 9.3.2),
// so every HEAD 404 takes this path: PostgREST answers 404 for a table that
// is not in the schema cache (PGRST205) and for a missing function (PGRST202).
// select('*', { count: 'exact', head: true }) on a wrong table name then gives
// { error: null, count: null }, and throwOnError() does not throw.
import { PostgrestClient } from '@supabase/postgrest-js'

const fakeFetch = async (_input: string | URL | Request, init: RequestInit = {}) => {
  // PostgREST: 404 + PGRST205 for a missing table. HEAD: same status, no body.
  const body =
    init.method === 'HEAD'
      ? null
      : JSON.stringify({ code: 'PGRST205', details: null, hint: null, message: "Could not find the table 'public.ordrs' in the schema cache" })
  return new Response(body, { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' } })
}

const client = new PostgrestClient('https://example.supabase.co/rest/v1', { fetch: fakeFetch })

const get = await client.from('ordrs').select('*', { count: 'exact' })
console.log(`GET  -> status ${get.status}, success ${get.success}, error ${JSON.stringify(get.error?.code ?? null)}, count ${get.count}`)

const head = await client.from('ordrs').select('*', { count: 'exact', head: true })
console.log(`HEAD -> status ${head.status} ${JSON.stringify(head.statusText)}, success ${head.success}, error ${JSON.stringify(head.error)}, count ${head.count}`)

let thrown = false
try {
  await client.from('ordrs').select('*', { count: 'exact', head: true }).throwOnError()
} catch {
  thrown = true
}
console.log(`HEAD with throwOnError() -> threw: ${thrown}`)
console.log('expected: HEAD reports the 404 as an error (status 404, success false), like GET does, and throwOnError() throws')

if (head.error === null || head.status !== 404 || !thrown) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
