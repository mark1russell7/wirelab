// F0180: graphql-request 7.4.0. setHeader() has no effect when the headers of the client are a Headers instance, an array or a function.
//
// build/legacy/classes/GraphQLClient.js:141-152: setHeader does `headers[key] = value`
// when headers exist. On a Headers instance or an array, this sets a JavaScript
// property, not a header. On a function (the client calls it for each request, prelude.js
// callOrIdentity), it sets a property of the function. The client accepts each of these
// types, and the comment at line 144 names the array case as a todo. Issue #298 (2024,
// closed with no change) reported the Headers case.
import { GraphQLClient } from 'graphql-request'

const auth: (string | null)[] = []
const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  auth.push(new Request(input, init).headers.get('authorization'))
  return new Response(JSON.stringify({ data: { a: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const url = 'https://api.example.com/graphql'
const cases = [
  ['a plain object', new GraphQLClient(url, { fetch: fakeFetch, headers: { 'x-app': '1' } })],
  ['a Headers instance', new GraphQLClient(url, { fetch: fakeFetch, headers: new Headers({ 'x-app': '1' }) })],
  ['an array', new GraphQLClient(url, { fetch: fakeFetch, headers: [['x-app', '1']] })],
  ['a function', new GraphQLClient(url, { fetch: fakeFetch, headers: () => ({ 'x-app': '1' }) })],
] as const
for (const [, client] of cases) {
  client.setHeader('authorization', 'Bearer new')
  await client.request('{ a }')
}
cases.forEach(([name], i) => console.log(`headers as ${name.padEnd(18)} -> authorization: ${auth[i]}`))
console.log('expected: authorization: Bearer new in each case')

if (auth.some((a) => a !== 'Bearer new')) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
