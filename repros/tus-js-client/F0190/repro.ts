// F0190: tus-js-client 4.3.1. abort() stops nothing when the app calls it before the first request. start() calculates the
// fingerprint and opens the file first, and both are asynchronous. Then _startSingleUpload() sets `_aborted = false`
// again and sends the requests, so the upload runs to its end and onSuccess runs. The API documents of abort() say: "After
// abort is called, no event handler will be invoked anymore."
//
// The same occurs when a retry calls start() again and the app calls abort() in that interval.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Upload } from 'tus-js-client'

const requests: string[] = []
const server = createServer((req, res) => {
  requests.push(`${req.method} ${req.url}`)
  req.resume()
  const headers: Record<string, string> = { 'Tus-Resumable': '1.0.0' }
  if (req.method === 'POST') {
    res.writeHead(201, { ...headers, Location: '/files/1' }).end()
  } else if (req.method === 'PATCH') {
    req.on('end', () => res.writeHead(204, { ...headers, 'Upload-Offset': '5' }).end())
  } else {
    res.writeHead(404, headers).end()
  }
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

const events: string[] = []
const upload = new Upload(Buffer.from('hello'), {
  endpoint: `${base}/files/`,
  retryDelays: null,
  onProgress: (sent, total) => events.push(`onProgress ${sent}/${total}`),
  onSuccess: () => events.push('onSuccess'),
  onError: (e) => events.push(`onError: ${e.message}`),
})
upload.start()
await upload.abort()
console.log('upload.start(), then await upload.abort() at once')

await new Promise((resolve) => setTimeout(resolve, 1000))
server.close()
console.log(`the requests of the server in 1000 ms: ${JSON.stringify(requests)}`)
console.log(`the callbacks after abort(): ${JSON.stringify(events)}`)

const bug = requests.length > 0 || events.length > 0
console.log('expected: no request and no callback after abort()')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
