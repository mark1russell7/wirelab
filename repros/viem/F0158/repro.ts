// F0158: viem 2.58.0. The transport fallback({ rank }) scores each transport with
// latencyScore = 1 - meanLatency / maxLatency (clients/transports/fallback.ts,
// rankTransports step 4). When every sampled latency is 0 ms (Date.now() has
// 1 ms steps, so a fast local or in-process transport measures 0), the score of
// each working transport is NaN. The sort comparator then returns NaN, which
// Array.prototype.sort treats as "equal", so a transport that fails every ping
// is not moved down: it stays first.
import { createClient, custom, fallback } from 'viem'

// Variant: freeze Date.now() so that every ping measures 0 ms, as a fast
// local transport does when it answers inside one 1 ms clock step.
const frozen = Date.now()
Date.now = () => frozen

let downCalls = 0
let upCalls = 0
const down = custom({
  async request() {
    downCalls++
    throw new Error('node down')
  },
})
const up = custom({
  async request({ method }) {
    upCalls++
    if (method === 'net_listening') return true
    return '0x1'
  },
})

const client = createClient({
  transport: fallback([down, up], { rank: { interval: 60_000, sampleCount: 1 } }),
})

// Let the first ranking round (one ping to each transport) finish.
await new Promise((r) => setTimeout(r, 200))
const downBefore = downCalls
await client.request({ method: 'eth_chainId' })
const triedDownFirst = downCalls > downBefore
console.log('first ranking round done; failing transport pinged:', downBefore, 'time(s)')
console.log('eth_chainId tried the failing transport first:', triedDownFirst)

// Correct: after a round where `down` failed and `up` succeeded, `up` ranks first.
const bug = triedDownFirst
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
