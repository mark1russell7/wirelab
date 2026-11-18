// F0172: @supabase/postgrest-js 2.119.0. rpc(fn, args, { get: true }) sends an object argument as the text "[object Object]".
//
// dist/index.mjs:4009-4018 (rpc): the source comment says "objects/arrays-of-
// objects can't be serialized to URL params, use POST + return=minimal
// instead", but `_hasObjectArg = head && ...` applies that only to head. With
// get: true each argument goes through `${value}` (or `{${value.join(",")}}`
// for an array), so a json/jsonb argument becomes "[object Object]" and an
// array of objects becomes "{[object Object]}". The declared Args type of the
// function accepts the object, and the server gets a value the caller never gave.
import { PostgrestClient } from '@supabase/postgrest-js'

type Call = { url: string; method: string; body?: unknown }
const calls: Call[] = []
const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  calls.push({ url: String(input), method: String(init.method), body: init.body })
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
}

const client = new PostgrestClient('https://example.supabase.co/rest/v1', { fetch: fakeFetch })

await client.rpc('search_items', { filter: { color: 'red' }, ids: [{ id: 1 }] }, { get: true })
const getCall = calls[0]
const params = Object.fromEntries(new URL(getCall.url).searchParams)
console.log(`get: true  -> ${getCall.method} ${decodeURIComponent(getCall.url)}`)
console.log(`  filter=${JSON.stringify(params.filter)}  ids=${JSON.stringify(params.ids)}`)

calls.length = 0
await client.rpc('search_items', { filter: { color: 'red' }, ids: [{ id: 1 }] }, { head: true })
console.log(`head: true -> ${calls[0].method} body ${calls[0].body} (the head path keeps the objects)`)
console.log('expected: get: true sends the objects as JSON text or rejects them with a clear error, never "[object Object]"')

if (Object.values(params).some((v) => v.includes('[object Object]'))) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
