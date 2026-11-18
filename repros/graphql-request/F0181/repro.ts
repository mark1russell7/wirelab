// F0181: graphql-request 7.4.0. A request header does not replace a client header with the same name in a different case: the two values are joined.
//
// build/legacy/classes/GraphQLClient.js:73-76 merges the headers as two plain objects:
// `{ ...clientHeaders, ...requestHeaders }`. The keys are case-sensitive, so
// `Authorization` and `authorization` are two keys. runRequest.js:115 then makes
// `new Headers(object)`, which appends each key, and the request has the header
// `authorization: Bearer old, Bearer new`. A Headers instance always gives lowercase
// names, so a Headers instance as request headers hits this with each client header
// that has a capital letter.
import { GraphQLClient } from 'graphql-request'

const auth: (string | null)[] = []
const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  auth.push(new Request(input, init).headers.get('authorization'))
  return new Response(JSON.stringify({ data: { a: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const client = new GraphQLClient('https://api.example.com/graphql', {
  fetch: fakeFetch,
  headers: { Authorization: 'Bearer old' },
})
await client.request('{ a }', {}, { authorization: 'Bearer new' })
await client.request('{ a }', {}, new Headers({ Authorization: 'Bearer new' }))

console.log(`request headers { authorization }       -> authorization: ${auth[0]}`)
console.log(`request headers new Headers({ Authorization }) -> authorization: ${auth[1]}`)
console.log('expected: authorization: Bearer new (the request header replaces the client header)')

if (auth.some((a) => a !== 'Bearer new')) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
