// F0182: graphql-request 7.4.0. With a BigInt variable (sent through the jsonSerializer option), a GraphQL error throws a TypeError, not a ClientError.
//
// build/legacy/classes/ClientError.js:5-8 builds the message with
// JSON.stringify({ response, request }), with no replacer. The request has the
// variables. A custom jsonSerializer can send a BigInt, but the native JSON.stringify
// throws "Do not know how to serialize a BigInt". So the ClientError constructor
// throws, and the caller gets a TypeError: the GraphQL error, its status and the
// response are lost, and `instanceof ClientError` is false.
import { ClientError, GraphQLClient } from 'graphql-request'

const fakeFetch = async (_input: string | URL | Request, _init: RequestInit = {}) =>
  new Response(JSON.stringify({ data: null, errors: [{ message: 'user not found' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const jsonSerializer = {
  stringify: (value: unknown) => JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  parse: (text: string) => JSON.parse(text) as unknown,
}
const client = new GraphQLClient('https://api.example.com/graphql', { fetch: fakeFetch, jsonSerializer })

let caught: unknown
try {
  await client.request('query User($id: ID!) { user(id: $id) { name } }', { id: 2n ** 64n })
} catch (e) {
  caught = e
}
const err = caught as Error
console.log(`observed: ${err?.constructor?.name}: ${err?.message?.slice(0, 60)}`)
console.log(`observed: instanceof ClientError = ${caught instanceof ClientError}`)
console.log('expected: a ClientError with the message "user not found"')

if (!(caught instanceof ClientError)) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
