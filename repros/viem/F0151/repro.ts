// F0151: viem 2.58.0. The IPC transport parses each framed message with JSON.parse
// inside the socket 'data' listener, with no try/catch (utils/rpc/ipc.ts:85-87).
// A frame with balanced braces that is not valid JSON makes JSON.parse throw
// out of the listener: an uncaught exception, which ends a Node process.
// The WebSocket path (utils/rpc/webSocket.ts:42-47) has a try/catch.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { createPublicClient } from 'viem'
import { ipc } from 'viem/node'

let uncaught: unknown
process.on('uncaughtException', (err) => {
  uncaught = err
})

const path =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\viem-F0151-${process.pid}`
    : join(tmpdir(), `viem-F0151-${process.pid}.sock`)

const server = createServer((socket) => {
  socket.on('data', () => {
    // A frame with balanced braces that is not valid JSON.
    socket.write('{"jsonrpc":"2.0","id":0,"result":}')
  })
})
await new Promise<void>((r) => server.listen(path, r))

const client = createPublicClient({
  transport: ipc(path, { retryCount: 0, timeout: 1_000, reconnect: false }),
})

const outcome = await client.getChainId().then(
  (v) => `resolved ${v}`,
  (e) => `rejected ${(e as Error).name}`,
)
console.log('request outcome:', outcome)
console.log(
  'uncaught exception:',
  uncaught ? `${(uncaught as Error).name}: ${(uncaught as Error).message}` : 'none',
)
server.close()

const bug = uncaught !== undefined
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
