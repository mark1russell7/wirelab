// F0152: viem 2.58.0. The IPC frame splitter (utils/rpc/ipc.ts:27-63) counts braces
// and lets the depth go below zero. One stray '}' outside a message leaves the
// depth at -1 for the life of the socket, so every later reply is dropped and
// each request times out, until the socket reconnects.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { createPublicClient } from 'viem'
import { ipc } from 'viem/node'

const path =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\viem-F0152-brace-${process.pid}`
    : join(tmpdir(), `viem-F0152-brace-${process.pid}.sock`)

let n = 0
const server = createServer((socket) => {
  let buf = ''
  socket.on('data', (d) => {
    buf += d.toString()
    // Requests arrive as concatenated JSON objects with no separator.
    const parts = buf.split(/(?<=\})(?=\{)/)
    buf = ''
    for (const part of parts) {
      const req = JSON.parse(part) as { id: number }
      // Before the first reply only, the server writes one stray '}'.
      const prefix = n++ === 0 ? '}\n' : ''
      socket.write(`${prefix}{"jsonrpc":"2.0","id":${req.id},"result":"0x1"}\n`)
    }
  })
})
await new Promise<void>((r) => server.listen(path, r))

const client = createPublicClient({
  transport: ipc(path, { retryCount: 0, timeout: 1_000, reconnect: false }),
})

const outcomes: string[] = []
for (const label of ['first', 'second', 'third']) {
  const o = await client.getChainId().then(
    (v) => `resolved ${v}`,
    (e) => `rejected ${(e as Error).name}`,
  )
  outcomes.push(o)
  console.log(`${label} request (server sent a valid reply):`, o)
}
server.close()

// Correct: at least the replies after the stray byte are delivered.
const bug = outcomes.slice(1).some((o) => o.startsWith('rejected'))
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
