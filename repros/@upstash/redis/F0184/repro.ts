// F0184: @upstash/redis 1.41.0. geopos() drops each member that has no position, so the next positions move to the wrong members.
//
// pkg/commands/geo_pos.ts: transform() skips each null entry of the GEOPOS reply
// (`if (!pos?.[0] || !pos?.[1]) continue`). Redis gives one entry for each member,
// in the order of the members, and a null entry for a member that is not in the key.
// So the result has fewer entries than members, and the entry at index i is not the
// position of member i.
import { Redis } from '@upstash/redis'

// The GEOPOS reply of Redis for Palermo, a member that is not in the key, and Catania.
const reply = [['13.36138933897018433', '38.11555639549629859'], null, ['15.08726745843887329', '37.50266842333162032']]

// A fake Upstash REST endpoint. With auto-pipelining (the default), the command goes to /pipeline.
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as unknown[]
  const one = { result: reply }
  const isPipeline = String(input).endsWith('/pipeline')
  return new Response(JSON.stringify(isPipeline ? body.map(() => one) : one), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}) as typeof fetch

const redis = new Redis({ url: 'https://example.upstash.io', token: 'test-token', enableTelemetry: false })
const members = ['Palermo', 'Nowhere', 'Catania']
const positions = (await redis.geopos('Sicily', ...members)) as unknown[]

console.log(`members:   ${JSON.stringify(members)}`)
console.log(`positions: ${JSON.stringify(positions)}`)
console.log(`observed: ${positions.length} entries for ${members.length} members, entry 1 (Nowhere) = ${JSON.stringify(positions[1])}`)
console.log('expected: 3 entries in the order of the members, with null for Nowhere')

if (positions.length !== members.length || positions[1] !== null) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
