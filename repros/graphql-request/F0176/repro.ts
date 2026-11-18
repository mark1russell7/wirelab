// F0176: graphql-request 7.4.0. With excludeOperationName: true and method: 'GET', a mutation is sent with GET.
//
// build/legacy/helpers/analyzeDocument.js:61-64 returns isMutation: false when
// excludeOperationName is true, before it parses the document. runRequest.js:11-14
// uses POST only when document.isMutation is true, else the method of the client.
// The README describes excludeOperationName only as a way to skip the parse of the
// operation name. GraphQL over HTTP (section "GET") does not allow a mutation over
// GET, and without the option the client sends the same mutation with POST.
import { GraphQLClient } from 'graphql-request'

const methods: string[] = []
const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  methods.push(new Request(input, init).method)
  return new Response(JSON.stringify({ data: { deleteUser: { id: '1' } } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const url = 'https://api.example.com/graphql'
const mutation = 'mutation DeleteUser { deleteUser(id: 1) { id } }'

await new GraphQLClient(url, { fetch: fakeFetch, method: 'GET' }).request(mutation)
await new GraphQLClient(url, { fetch: fakeFetch, method: 'GET', excludeOperationName: true }).request(mutation)

console.log(`method: 'GET'                             -> the mutation is sent with ${methods[0]}`)
console.log(`method: 'GET', excludeOperationName: true -> the mutation is sent with ${methods[1]}`)
console.log('expected: POST for a mutation in both cases')

if (methods[1] !== 'POST') {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
