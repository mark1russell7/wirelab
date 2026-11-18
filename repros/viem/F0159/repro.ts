// F0159: viem 2.58.0. An HTTP 200 reply with an empty body and no JSON content type
// is parsed as '{}' (utils/rpc/http.ts:198-201: JSON.parse(data || '{}')).
// That object has neither `result` nor `error`, so the transport returns
// `undefined` as a success (clients/transports/http.ts:173-187). For example
// sendRawTransaction resolves with `undefined` instead of a hash or an error.
import { createServer } from 'node:http'
import { createPublicClient, http } from 'viem'

const server = createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    // A proxy or a broken node answers 200 with an empty body.
    res.statusCode = 200
    res.end()
  })
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const { port } = server.address() as { port: number }

const client = createPublicClient({
  transport: http(`http://127.0.0.1:${port}`, { retryCount: 0 }),
})

const outcome = await client
  .sendRawTransaction({ serializedTransaction: '0x02c0' })
  .then(
    (hash) => `resolved ${JSON.stringify(hash) ?? 'undefined'}`,
    (e) => `rejected ${(e as Error).name}`,
  )
server.close()
console.log('sendRawTransaction with an empty 200 reply:', outcome)

// Correct: an error, because the reply has no JSON-RPC response object.
const bug = outcome.startsWith('resolved')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
