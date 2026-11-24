// F0193: aws4fetch 1.0.20. AwsClient.sign() reads the body of a Request input when the Request has a Content-Type header
// (`init.body = await input.clone().arrayBuffer()`). For a GET or HEAD Request, that body is an empty ArrayBuffer, and
// `new Request()` refuses a GET or HEAD request with a body. Thus aws.fetch() of a GET or HEAD Request with a Content-Type
// header rejects with a TypeError, and no request goes out. The same call with a URL and an init object works.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { AwsClient } from 'aws4fetch'

const requests: string[] = []
const server = createServer((req, res) => {
  requests.push(`${req.method} ${req.url}`)
  req.resume()
  res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}')
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/prod/items`

const aws = new AwsClient({
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  service: 'execute-api',
  region: 'us-east-1',
  retries: 0,
})
const headers = { 'Content-Type': 'application/json' }
const outcome = async (call: () => Promise<Response>): Promise<string> => {
  try {
    const response = await call()
    await response.arrayBuffer()
    return `HTTP ${response.status}`
  } catch (e) {
    return `${(e as Error).name}: ${(e as Error).message}`
  }
}

const getInit = await outcome(() => aws.fetch(url, { headers }))
const getRequest = await outcome(() => aws.fetch(new Request(url, { headers })))
const headRequest = await outcome(() => aws.fetch(new Request(url, { method: 'HEAD', headers })))
server.close()
server.closeAllConnections()

console.log(`aws.fetch(url, { headers: { 'Content-Type': 'application/json' } }): ${getInit}`)
console.log(`aws.fetch(new Request(url, { headers })): ${getRequest}`)
console.log(`aws.fetch(new Request(url, { method: 'HEAD', headers })): ${headRequest}`)
console.log(`the requests of the server: ${JSON.stringify(requests)}`)

const bug = getInit === 'HTTP 200' && (getRequest !== 'HTTP 200' || headRequest !== 'HTTP 200')
console.log('expected: a signed GET or HEAD request goes out for a Request input, as for a URL and an init object')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
