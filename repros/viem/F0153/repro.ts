// F0153: viem 2.58.0. Transport.subscribe() returns unsubscribe(), which sends
// eth_unsubscribe with rpcClient.request() and no onError
// (clients/transports/webSocket.ts:160-171). When the socket is closed,
// socket.request() throws, utils/rpc/socket.ts:318-320 passes the error to
// onError, which is undefined, so the error is lost and the promise that
// unsubscribe() returns never settles.
import { WebSocketServer } from 'ws'
import { webSocket } from 'viem'

const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
await new Promise<void>((r) => wss.once('listening', r))
const { port } = wss.address() as { port: number }

let firstConnection = true
wss.on('connection', (ws) => {
  const isFirst = firstConnection
  firstConnection = false
  ws.on('message', (raw) => {
    const req = JSON.parse(raw.toString())
    if (req.method === 'eth_subscribe') {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: '0xabc' }))
      // The server drops the first connection right after the subscribe.
      if (isFirst) setTimeout(() => ws.terminate(), 50)
    } else if (req.id !== null) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: true }))
    }
  })
})

const transport = webSocket(`ws://127.0.0.1:${port}`, {
  reconnect: { delay: 500, attempts: 5 },
  keepAlive: false,
})({ retryCount: 0 })

const { unsubscribe } = await transport.value!.subscribe({
  params: ['newHeads'],
  onData: () => {},
  onError: () => {},
})

// Wait until the server has dropped the socket, then unsubscribe.
await new Promise((r) => setTimeout(r, 200))
const outcome = await Promise.race([
  unsubscribe().then(
    () => 'resolved',
    (e: Error) => `rejected ${e.name}`,
  ),
  new Promise<string>((r) => setTimeout(() => r('still pending after 5 s'), 5_000)),
])
console.log('unsubscribe() on a closed socket:', outcome)
wss.close()
for (const c of wss.clients) c.terminate()

const bug = outcome.startsWith('still pending')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
