// F0171: @supabase/postgrest-js 2.119.0. The client timeout ends when headers arrive, so a response body that stalls hangs the query with no limit.
//
// dist/index.mjs:3643-3666 (withTimeout) gives fetch its own controller.signal
// and, in `.finally(...)` when the headers arrive, clears the timer and
// removes the link to the caller's signal. processResponse
// (dist/index.mjs:476 and 513) then reads the body with `await res.text()`,
// which nothing guards. The option doc (dist/index.d.mts:5089) says: "requests
// will automatically abort after this duration to prevent indefinite hangs".
// A second effect: with `timeout` set, abortSignal() also stops working after
// the headers.
// The fake fetch acts as fetch does: an abort of init.signal after the headers
// errors the body stream (case B, the control, shows it). The body sends "["
// and then stalls.
import { PostgrestClient } from '@supabase/postgrest-js'

const WATCH_MS = 2500

const fakeFetch = async (_input: string | URL | Request, init: RequestInit = {}) => {
  const signal = init.signal
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('['))
      // No more data and no close: a stalled body.
      signal?.addEventListener('abort', () => controller.error(new DOMException('This operation was aborted', 'AbortError')), {
        once: true,
      })
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
}

const base = 'https://example.supabase.co/rest/v1'

async function watch(label: string, run: () => PromiseLike<{ error: { message?: string } | null }>) {
  const started = Date.now()
  let settled: string | null = null
  const p = run().then(
    (r) => {
      settled = `resolved after ${Date.now() - started} ms: error ${JSON.stringify(r.error?.message ?? null)}`
    },
    (e) => {
      settled = `rejected after ${Date.now() - started} ms: ${e}`
    },
  )
  await Promise.race([p, new Promise((r) => setTimeout(r, WATCH_MS))])
  const text = settled ?? `still pending after ${Date.now() - started} ms`
  console.log(`${label}\n  observed: ${text}`)
  return settled !== null
}

const [a, b, c] = await Promise.all([
  watch('A: new PostgrestClient(url, { timeout: 300 }), stalled body', () =>
    new PostgrestClient(base, { fetch: fakeFetch, timeout: 300 }).from('orders').select('*'),
  ),
  watch('B (control): no timeout option, .abortSignal(AbortSignal.timeout(300))', () =>
    new PostgrestClient(base, { fetch: fakeFetch }).from('orders').select('*').abortSignal(AbortSignal.timeout(300)),
  ),
  watch('C: { timeout: 60000 } and .abortSignal(AbortSignal.timeout(300))', () =>
    new PostgrestClient(base, { fetch: fakeFetch, timeout: 60_000 }).from('orders').select('*').abortSignal(AbortSignal.timeout(300)),
  ),
])

console.log('expected: A and C end with an abort error about 300 ms after they start, as B does')

if (b && (!a || !c)) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
