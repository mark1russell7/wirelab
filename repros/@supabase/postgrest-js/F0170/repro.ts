// F0170: @supabase/postgrest-js 2.119.0. Retry-After in HTTP-date form is read as 0 seconds, so a 503 retry starts at once.
//
// dist/index.mjs:224-225 (fetchWithRetry) computes the delay as
// `Math.max(0, parseInt(retryAfterHeader, 10) || 0) * 1e3`. RFC 9110 10.2.3
// allows `Retry-After: HTTP-date` as well as delay-seconds. parseInt of a
// date ("Wed, ...") is NaN, so the delay is 0 ms, and the client sends the
// retry at once (up to three retries in a row while the server answers 503)
// in place of the time the server asked for. The same line has no upper
// bound: `Retry-After: 2000000` waits 23 days, and a value above 2147483 s
// overflows setTimeout, which Node then fires after 1 ms. The doc comment (dist/index.mjs:190) says the wait "honours the
// Retry-After header when present".
// The script records each delay given to setTimeout and runs the timer at once.
import { PostgrestClient } from '@supabase/postgrest-js'

const delays: number[] = []
const realSetTimeout = globalThis.setTimeout
// Record the delay of each timer, then run it without the wait.
globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  delays.push(ms ?? 0)
  return realSetTimeout(fn, 0, ...args)
}) as typeof setTimeout

const retryAt = new Date(Date.now() + 120_000).toUTCString() // 2 minutes from now
let attempt = 0
const fakeFetch = async (_input: string | URL | Request, _init: RequestInit = {}) => {
  attempt++
  if (attempt === 1) {
    return new Response('{"message":"schema cache is loading"}', {
      status: 503,
      headers: { 'content-type': 'application/json', 'retry-after': retryAt },
    })
  }
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
}

const client = new PostgrestClient('https://example.supabase.co/rest/v1', { fetch: fakeFetch })
const res = await client.from('orders').select('*')
globalThis.setTimeout = realSetTimeout

const waited = delays[0] ?? -1
console.log(`Retry-After header : ${retryAt}`)
console.log(`attempts           : ${attempt}, final status ${res.status}`)
console.log(`observed wait      : ${waited} ms before the retry`)
console.log('expected wait      : about 120000 ms (the time until the HTTP-date), RFC 9110 10.2.3')

if (waited < 100_000) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
