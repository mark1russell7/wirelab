// F0183: graphql-request 7.4.0. rawRequest() with an options object gives the responseMiddleware `variables: undefined`.
//
// build/legacy/classes/GraphQLClient.js:48 passes `variables` from the positional
// arguments of rawRequest() to the responseMiddleware. With an options object
// ({ query, variables }), the positional argument is undefined. request() passes
// requestOptions.variables (line 85), and the request itself has the variables.
import { GraphQLClient } from 'graphql-request'

const fakeFetch = async (_input: string | URL | Request, _init: RequestInit = {}) =>
  new Response(JSON.stringify({ data: { user: { name: 'a' } } }), { status: 200, headers: { 'content-type': 'application/json' } })

const got: unknown[] = []
const client = new GraphQLClient('https://api.example.com/graphql', {
  fetch: fakeFetch,
  responseMiddleware: (_response, request) => {
    got.push(request.variables)
  },
})
const query = 'query User($id: ID!) { user(id: $id) { name } }'
await client.request({ document: query, variables: { id: '1' } })
await client.rawRequest({ query, variables: { id: '1' } })

console.log(`request({ document, variables })  -> middleware variables ${JSON.stringify(got[0])}`)
console.log(`rawRequest({ query, variables })  -> middleware variables ${JSON.stringify(got[1])}`)
console.log('expected: {"id":"1"} in both cases')

if (JSON.stringify(got[1]) !== '{"id":"1"}') {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
