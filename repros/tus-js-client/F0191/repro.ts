// F0191: tus-js-client 4.3.1. After the creation request, _createUpload() calls _saveUploadInUrlStorage().then(...) with no
// catch, and does not return that promise. When the URL storage rejects addUpload() (a full disk, a locked file, a full
// localStorage), the upload stops after the POST request. No PATCH request goes out, neither onSuccess nor onError runs,
// and the rejection is not handled. _resumeUpload() has the same fault.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Upload } from 'tus-js-client'

const unhandled: string[] = []
process.on('unhandledRejection', (e) => unhandled.push(String(e)))

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

// A URL storage that cannot write, as when the disk is full.
const urlStorage = {
  findAllUploads: async () => [],
  findUploadsByFingerprint: async () => [],
  removeUpload: async () => {},
  addUpload: async (): Promise<string> => {
    throw new Error('ENOSPC: no space left on device')
  },
}
const events: string[] = []
new Upload(Buffer.from('hello'), {
  endpoint: `${base}/files/`,
  fingerprint: async () => 'hello-fingerprint',
  urlStorage,
  retryDelays: null,
  onSuccess: () => events.push('onSuccess'),
  onError: (e) => events.push(`onError: ${e.message}`),
}).start()

await new Promise((resolve) => setTimeout(resolve, 1000))
server.close()
console.log(`the requests of the server in 1000 ms: ${JSON.stringify(requests)}`)
console.log(`the callbacks: ${JSON.stringify(events)}`)
console.log(`unhandled rejections: ${JSON.stringify(unhandled)}`)

const bug = events.length === 0
console.log('expected: onError with the storage error, or the upload continues without the storage. One of onSuccess and onError runs')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
