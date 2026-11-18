// F0178: graphql-request 7.4.0. A batch reply with a GraphQL error gives a ClientError with no `errors` and a generic message.
//
// build/legacy/helpers/runRequest.js:71 (and line 54 for a reply that is not 2xx)
// builds the response of the error as `{ ...result.executionResults, ...clientResponseBase }`.
// The spread of an array gives the keys "0", "1", ..., so response.errors is undefined.
// ClientError.extractMessage (ClientError.js:19) then gives "GraphQL Error (Code: 200)",
// and the message of the GraphQL error is only inside the JSON dump of the message.
import { GraphQLClient, type ClientError } from 'graphql-request'

const fakeFetch = async (_input: string | URL | Request, _init: RequestInit = {}) =>
  new Response(JSON.stringify([{ data: { a: 1 } }, { data: null, errors: [{ message: 'not allowed' }] }]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const client = new GraphQLClient('https://api.example.com/graphql', { fetch: fakeFetch })
let bug = true
try {
  await client.batchRequests([{ document: '{ a }' }, { document: '{ b }' }])
  console.log('observed: no throw')
} catch (e) {
  const err = e as ClientError
  const head = err.message.split(': {"response"')[0]
  console.log(`observed: message "${head}: {...}"`)
  console.log(`observed: response.errors = ${JSON.stringify(err.response.errors)}`)
  console.log(`observed: keys of response = ${Object.keys(err.response).join(', ')}`)
  bug = err.response.errors === undefined || !head.includes('not allowed')
}
console.log('expected: the message names "not allowed", and the error gives the errors of the batch (for example response.errors, or one result per item)')

if (bug) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
