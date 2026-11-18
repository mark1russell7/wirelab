// F0150: viem 2.58.0. The HTTP batch path matches replies to requests by sorted
// position, not by id. One reply item with `id: null` (JSON-RPC 2.0 requires
// a null id when the server cannot read the id of an item) moves the other
// replies to the wrong requests, and no error is raised.
import { createServer } from 'node:http'
import { createPublicClient, http } from 'viem'

const server = createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const batch = JSON.parse(raw) as { id: number; params: [string] }[]
    // Answer each eth_getBalance with the address-specific balance, except the
    // last item, which the server cannot read and answers with id null.
    const replies = batch.map((item, i) =>
      i === batch.length - 1
        ? { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
        : {
            jsonrpc: '2.0',
            id: item.id,
            result: item.params[0].endsWith('1') ? '0x1' : item.params[0].endsWith('2') ? '0x2' : '0x3',
          },
    )
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(replies))
  })
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const { port } = server.address() as { port: number }

const client = createPublicClient({
  transport: http(`http://127.0.0.1:${port}`, { batch: true, retryCount: 0 }),
})

const a1 = '0x0000000000000000000000000000000000000001'
const a2 = '0x0000000000000000000000000000000000000002'
const a3 = '0x0000000000000000000000000000000000000003'
const results = await Promise.allSettled([
  client.getBalance({ address: a1 }),
  client.getBalance({ address: a2 }),
  client.getBalance({ address: a3 }),
])
server.close()

const show = results.map((r) =>
  r.status === 'fulfilled' ? `ok ${r.value}` : `error ${(r.reason as Error).name}`,
)
console.log('address 1 ->', show[0], '(server sent 0x1 for id of address 1)')
console.log('address 2 ->', show[1], '(server sent 0x2 for id of address 2)')
console.log('address 3 ->', show[2], '(server sent an error with id null)')

// Correct: address 1 gets 1n, address 2 gets 2n.
const bug =
  !(results[0].status === 'fulfilled' && results[0].value === 1n) ||
  !(results[1].status === 'fulfilled' && results[1].value === 2n)
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
