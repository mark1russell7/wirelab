// F0186: birpc 4.2.0. A function that throws a falsy value (undefined, null, 0, '' or false),
// or that gives a promise rejected with no reason, gives the caller a success with the result undefined.
//
// src/main.ts, onMessage: the side that runs the function sends a success reply when
// `!error`, and the side that called it resolves the call when `!error`. Both test the
// truth of the thrown value, not whether the function threw.
import { MessageChannel } from 'node:worker_threads'
import { createBirpc } from 'birpc'

const thrown: unknown[] = [undefined, null, 0, '', false, new Error('real error')]
const bobFunctions = {
  fail(i: number): never {
    throw thrown[i]
  },
  rejectWithNoReason(): Promise<never> {
    return Promise.reject()
  },
}

const { port1, port2 } = new MessageChannel()
createBirpc<object, typeof bobFunctions>(bobFunctions, {
  post: (data) => port1.postMessage(data),
  on: (fn) => {
    port1.on('message', fn)
  },
})
const alice = createBirpc<typeof bobFunctions, object>({}, {
  post: (data) => port2.postMessage(data),
  on: (fn) => {
    port2.on('message', fn)
  },
})

let resolved = 0
for (let i = 0; i < thrown.length; i++) {
  const label = thrown[i] instanceof Error ? "new Error('real error')" : (JSON.stringify(thrown[i]) ?? 'undefined')
  try {
    const result = await alice.fail(i)
    resolved++
    console.log(`throw ${label}: the call resolved with ${String(result)}`)
  } catch (e) {
    console.log(`throw ${label}: the call rejected (${e instanceof Error ? e.message : String(e)})`)
  }
}
try {
  const result = await alice.rejectWithNoReason()
  resolved++
  console.log(`Promise.reject(): the call resolved with ${String(result)}`)
} catch (e) {
  console.log(`Promise.reject(): the call rejected (${String(e)})`)
}
port1.close()
port2.close()

const calls = thrown.length + 1
console.log(`expected: each of the ${calls} calls rejects, because each function threw or rejected`)
console.log(resolved > 0 ? `BUG PRESENT (${resolved} of ${calls} failed calls resolved)` : 'BUG ABSENT')
process.exitCode = resolved > 0 ? 1 : 0
