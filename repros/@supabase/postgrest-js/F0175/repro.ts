// F0175: @supabase/postgrest-js 2.119.0. The error of a failed query result is a plain object, not the declared PostgrestError: instanceof is false and toJSON() throws.
//
// dist/index.d.mts:666-671 declares `PostgrestResponseFailure.error:
// PostgrestError`, a class that extends Error and has name and toJSON()
// (dist/index.mjs:26-56). processResponse (dist/index.mjs:515, 526) returns
// the parsed body `JSON.parse(body)` or `{ message: body }`, and the fetch
// failure path (dist/index.mjs:446-453) returns an object literal. Only
// throwOnError() and getOpenApiSpec() (dist/index.mjs:3600) make instances.
// So `error instanceof PostgrestError` is false and `error.toJSON()`, which
// type-checks, throws a TypeError.
import { PostgrestClient, PostgrestError } from '@supabase/postgrest-js'

let mode: 'http' | 'network' = 'http'
const fakeFetch = async (_input: string | URL | Request, _init: RequestInit = {}) => {
  if (mode === 'network') throw new TypeError('fetch failed')
  return new Response(
    JSON.stringify({ code: '42501', details: null, hint: 'GRANT SELECT ON public.orders TO anon;', message: 'permission denied for table orders' }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )
}

const client = new PostgrestClient('https://example.supabase.co/rest/v1', { fetch: fakeFetch, retry: false })

let bug = false
for (const m of ['http', 'network'] as const) {
  mode = m
  const { error } = await client.from('orders').select('*')
  if (!error) throw new Error('expected an error result')
  let toJsonResult: string
  try {
    toJsonResult = JSON.stringify(error.toJSON())
  } catch (e) {
    toJsonResult = `throws ${(e as Error).name}: ${(e as Error).message}`
  }
  const isInstance = error instanceof PostgrestError
  if (!isInstance) bug = true
  console.log(`${m} failure: instanceof PostgrestError ${isInstance}, instanceof Error ${error instanceof Error}, name ${JSON.stringify(error.name)}`)
  console.log(`  error.toJSON() -> ${toJsonResult}`)
}

const spec = await client.getOpenApiSpec()
console.log(`control: getOpenApiSpec() error instanceof PostgrestError ${spec.error instanceof PostgrestError}`)
console.log('expected: error is a PostgrestError instance (declared type), so instanceof is true and toJSON() works')

if (bug) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
