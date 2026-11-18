// F0185: @upstash/redis 1.41.0. keys() and scan() give key names that JSON parsing changed.
//
// keys() and scan() send the reply through the automatic deserialization:
// parseResponse in pkg/util.ts (scan through deserializeScanResponse). It runs
// JSON.parse on each key name. So the key "123" comes back as the number 123, "null"
// as null, "\"draft\"" as "draft" and "{\"a\": 1}" as an object. The docs give the
// type string[]. The client did not write a key name as JSON, so the name must come
// back unchanged. del() with a changed name deletes a different key.
import { Redis } from '@upstash/redis'

const names = ['user:1', '123', 'null', '"draft"', '{"a": 1}']
const deleted: unknown[] = []

// A fake Upstash REST endpoint. With auto-pipelining (the default), del() goes to /pipeline.
const answer = (cmd: unknown[]): unknown => {
  const name = String(cmd[0]).toLowerCase()
  if (name === 'keys') return names
  if (name === 'scan') return ['0', names]
  if (name === 'del') {
    deleted.push(cmd[1])
    return 1
  }
  throw new Error(`unexpected command ${name}`)
}
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as unknown[]
  const isPipeline = String(input).endsWith('/pipeline')
  const reply = isPipeline ? (body as unknown[][]).map((c) => ({ result: answer(c) })) : { result: answer(body) }
  return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch

const redis = new Redis({ url: 'https://example.upstash.io', token: 'test-token', enableTelemetry: false })
const keys = await redis.keys('*')
const [, scanned] = await redis.scan(0)
for (const key of keys) await redis.del(key)

console.log('key name in Redis | keys() gives | scan() gives | del(that value) deletes')
names.forEach((n, i) => {
  console.log(`${JSON.stringify(n)} | ${JSON.stringify(keys[i])} (${typeof keys[i]}) | ${JSON.stringify(scanned[i])} | ${JSON.stringify(deleted[i])}`)
})
console.log('expected: each key name comes back as the same string, and del() deletes that key')

const changed = names.filter((n, i) => keys[i] !== n || scanned[i] !== n)
if (changed.length > 0) {
  console.log(`BUG PRESENT (${changed.length} of ${names.length} names changed)`)
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
