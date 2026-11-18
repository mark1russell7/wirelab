// F0154: viem 2.58.0. With reconnect: false, a non-JSON frame calls attemptReconnect(),
// which takes the else branch (utils/rpc/socket.ts:178-184): it clears the
// maps and drops the client from the cache, but it never closes the socket.
// The old WebSocket stays open (it keeps the process alive and the server keeps
// it), and the next request opens a second socket.
import { WebSocketServer } from 'ws'
import { createPublicClient, webSocket } from 'viem'

const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
await new Promise<void>((r) => wss.once('listening', r))
const { port } = wss.address() as { port: number }

let sentBadFrame = false
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const req = JSON.parse(raw.toString())
    if (req.method !== 'eth_chainId') return
    if (!sentBadFrame) {
      sentBadFrame = true
      ws.send('not json')
      return
    }
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: '0x1' }))
  })
})

const client = createPublicClient({
  transport: webSocket(`ws://127.0.0.1:${port}`, {
    retryCount: 0,
    keepAlive: false,
    reconnect: false,
    timeout: 2_000,
  }),
})

const first = await client.getChainId().then(
  (v) => `resolved ${v}`,
  (e) => `rejected ${(e as Error).name}`,
)
await new Promise((r) => setTimeout(r, 300))
const second = await client.getChainId().then(
  (v) => `resolved ${v}`,
  (e) => `rejected ${(e as Error).name}`,
)
await new Promise((r) => setTimeout(r, 300))
const open = [...wss.clients].filter((c) => c.readyState === c.OPEN).length
console.log('first request (server sent a non-JSON frame):', first)
console.log('second request:', second)
console.log('open sockets at the server from this one client:', open)
wss.close()
for (const c of wss.clients) c.terminate()

// Correct: the client closes the socket that it dropped, so 1 socket is open.
const bug = open > 1
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
