// F0179: graphql-request 7.4.0. With method: 'GET', the query is cleaned with a regular expression that also changes string literals.
//
// build/legacy/lib/graphql.js:7: cleanQuery = str.replace(/([\s,]|#[^\n\r]+)+/g, ' ').trim(),
// used for GET at runRequest.js:175. It does not skip string literals. So a `#` in a
// string removes the rest of its line (as a comment), a comma in a string becomes a
// space, and runs of spaces in a string become one space. The server then gets a
// different query, or one that does not parse. Issue #378 (2024) reported the comma part.
import { GraphQLClient } from 'graphql-request'

const urls: string[] = []
const fakeFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  urls.push(new Request(input, init).url)
  return new Response(JSON.stringify({ data: { search: [] } }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const client = new GraphQLClient('https://api.example.com/graphql', { fetch: fakeFetch, method: 'GET' })
const document = 'query {\n  search(text: "C# tips, 2  spaces") { id }\n}'
await client.request(document)

const sent = new URL(urls[0]).searchParams.get('query') ?? ''
console.log(`document: ${JSON.stringify(document)}`)
console.log(`sent:     ${JSON.stringify(sent)}`)
console.log('expected: the string literal "C# tips, 2  spaces" is sent as it is')

if (!sent.includes('"C# tips, 2  spaces"')) {
  console.log('BUG PRESENT')
  process.exitCode = 1
} else {
  console.log('BUG ABSENT')
}
