// F0169: @supabase/postgrest-js 2.119.0. A non-2xx reply whose body is a JSON scalar (null, false, 0, "") is not an error: success true or no throw.
//
// dist/index.mjs:513-528 (processResponse, the !res.ok branch) does
// `error = JSON.parse(body)` and then `if (error && shouldThrowOnError) throw`,
// and the result has `success: error === null`. It does not check that the
// parsed body is an object. A 500 whose body is `null` gives
// { success: true, error: null, data: null, status: 500 }. A body of `false`,
// `0` or `""` gives success false but a falsy error, so `if (error)` checks
// pass and throwOnError() resolves in place of a throw.
import { PostgrestClient } from '@supabase/postgrest-js'

let nextBody = 'null'
const fakeFetch = async (_input: string | URL | Request, _init: RequestInit = {}) =>
  new Response(nextBody, { status: 500, statusText: 'Internal Server Error', headers: { 'content-type': 'application/json' } })

const client = new PostgrestClient('https://example.supabase.co/rest/v1', { fetch: fakeFetch })

let bug = false
for (const body of ['null', 'false', '0', '""']) {
  nextBody = body
  const res = await client.from('orders').select('*')
  let threw = false
  try {
    await client.from('orders').select('*').throwOnError()
  } catch {
    threw = true
  }
  const reportsError = res.success === false && !!res.error
  if (!reportsError || !threw) bug = true
  console.log(
    `500 with body ${body.padEnd(5)} -> success ${res.success}, error ${JSON.stringify(res.error)}, status ${res.status}; throwOnError() threw: ${threw}`,
  )
}
console.log('expected: each 500 reply gives success false, a truthy error object, and throwOnError() throws')

if (bug) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
