// F0194: aws4fetch 1.0.20. AwsClient.sign() copies only the method, the URL, the headers and the body of a Request input
// into the signed Request. The signal of the Request is lost, and its redirect mode too. Thus an app that aborts the
// Request does not stop aws.fetch(): the request continues until the server answers. The same call with a URL and an init
// object stops at the abort.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { AwsClient } from 'aws4fetch'

// A server that never answers, as a stuck service does.
const requests: string[] = []
const server = createServer((req) => {
  requests.push(`${req.method} ${req.url}`)
  req.resume()
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

// The app aborts after 200 ms. The run waits 1500 ms for the result.
const abortAfter200 = async (call: (signal: AbortSignal) => Promise<Response>): Promise<string> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 200)
  const result = await Promise.race([
    call(controller.signal).then(
      (response) => `HTTP ${response.status}`,
      (e: Error) => e.name,
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('no result 1300 ms after the abort'), 1500)),
  ])
  clearTimeout(timer)
  return result
}

const withInit = await abortAfter200((signal) => aws.fetch(url, { signal }))
const withRequest = await abortAfter200((signal) => aws.fetch(new Request(url, { signal })))

const controller = new AbortController()
const signed = await aws.sign(new Request(url, { signal: controller.signal, redirect: 'manual' }))
controller.abort()
server.close()
server.closeAllConnections()

console.log(`aws.fetch(url, { signal }), abort after 200 ms: ${withInit}`)
console.log(`aws.fetch(new Request(url, { signal })), abort after 200 ms: ${withRequest}`)
console.log(`aws.sign(new Request(url, { signal, redirect: 'manual' })), then abort: signed.signal.aborted = ${signed.signal.aborted}, signed.redirect = ${signed.redirect}`)
console.log(`the requests of the server: ${JSON.stringify(requests)}`)

const bug = withInit === 'AbortError' && withRequest !== 'AbortError'
console.log('expected: the abort of a Request input stops aws.fetch() with an AbortError, as for a URL and an init object')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
