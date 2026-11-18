// F0177: graphql-request 7.4.0. batchRequests() with method: 'GET' and a mutation in the batch throws a TypeError.
//
// build/legacy/classes/GraphQLClient.js:96 takes `const { headers, excludeOperationName,
// ...fetchOptions } = this.requestConfig`, so fetchOptions keeps `method`. request()
// and rawRequest() take `method` out (lines 23 and 60). runRequest.js:15-17 selects
// POST for a batch with a mutation and builds a body, but runRequest.js:131 builds
// the init as `{ method, headers, body, ...params.fetchOptions }`, so the method of
// the client ('GET') replaces POST. fetch then rejects a GET with a body.
import { GraphQLClient } from 'graphql-request'

const sent: string[] = []
const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = new Request(input, init) // the same check as fetch: a GET request cannot have a body
  sent.push(req.method)
  return new Response(JSON.stringify([{ data: { a: 1 } }, { data: { deleteUser: { id: '1' } } }]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const client = new GraphQLClient('https://api.example.com/graphql', { fetch: fakeFetch, method: 'GET' })
let outcome: string
try {
  await client.batchRequests([{ document: '{ a }' }, { document: 'mutation { deleteUser(id: 1) { id } }' }])
  outcome = `sent with ${sent[0]}`
} catch (e) {
  outcome = `threw ${(e as Error).name}: ${(e as Error).message}`
}
console.log(`batchRequests([query, mutation]) with method: 'GET' -> ${outcome}`)
console.log('expected: the batch is sent with POST, as request() does for a mutation')

if (sent[0] !== 'POST') {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
