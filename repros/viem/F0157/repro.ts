// F0157: viem 2.58.0. The IPC transport's subscribe() sends eth_subscribe with
// rpcClient.request() and no onError (clients/transports/ipc.ts:151-174).
// The WebSocket transport passes onError (clients/transports/webSocket.ts:178).
// When the socket closes before the reply, the close error goes to an
// undefined onError, and the promise that subscribe() returns never settles.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { ipc } from 'viem/node'

const path =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\viem-F0157-sub-${process.pid}`
    : join(tmpdir(), `viem-F0157-sub-${process.pid}.sock`)

const server = createServer((socket) => {
  socket.on('data', (d) => {
    // The node drops the connection when it gets the subscribe request.
    if (d.toString().includes('eth_subscribe')) socket.destroy()
  })
})
await new Promise<void>((r) => server.listen(path, r))

const transport = ipc(path, { reconnect: false })({ retryCount: 0 })
let onErrorCalls = 0
const outcome = await Promise.race([
  transport.value!.subscribe({
    params: ['newHeads'],
    onData: () => {},
    onError: () => onErrorCalls++,
  }).then(
    () => 'resolved',
    (e: Error) => `rejected ${e.name}`,
  ),
  new Promise<string>((r) => setTimeout(() => r('still pending after 5 s'), 5_000)),
])
console.log('subscribe() when the socket closes before the reply:', outcome)
console.log('onError calls:', onErrorCalls)
server.close()

const bug = outcome.startsWith('still pending')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
