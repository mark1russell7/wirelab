// F0187: birpc 4.2.0. An onRequest hook that calls next() and does not wait for it
// (the type of the hook allows a void return) makes the call never settle, also after the timeout.
//
// src/main.ts, _call: the finally block after `await options.onRequest(...)` clears the
// timer and removes the pending call as soon as the hook returns. The reply comes later,
// finds no pending call and is dropped, and no timer is left to reject the call.
import { MessageChannel } from 'node:worker_threads'
import { createBirpc } from 'birpc'

const bobFunctions = {
  hi(name: string) {
    return `Hi ${name}`
  },
}

const { port1, port2 } = new MessageChannel()
createBirpc<object, typeof bobFunctions>(bobFunctions, {
  post: (data) => port1.postMessage(data),
  on: (fn) => {
    port1.on('message', fn)
  },
})
let replies = 0
const alice = createBirpc<typeof bobFunctions, object>({}, {
  timeout: 1000,
  post: (data) => port2.postMessage(data),
  on: (fn) => {
    port2.on('message', (data: { t?: string }) => {
      if (data.t === 's') replies++
      fn(data)
    })
  },
  onRequest(req, next) {
    console.log(`onRequest: ${req.m}`)
    void next()
  },
})

const outcome = await Promise.race([
  alice.hi('Alice').then(
    (result) => `the call resolved with ${JSON.stringify(result)}`,
    (e: Error) => `the call rejected (${e.message})`,
  ),
  new Promise<string>((resolve) => setTimeout(() => resolve('no result after 3000 ms (the timeout option is 1000 ms)'), 3000)),
])
port1.close()
port2.close()

console.log(outcome)
console.log(`replies that came back: ${replies}`)
console.log('expected: the call resolves with "Hi Alice", or rejects with a timeout after 1000 ms')
const bug = outcome.startsWith('no result')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
