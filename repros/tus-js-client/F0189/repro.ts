// F0189: tus-js-client 4.3.1. encodeMetadata() writes each metadata key into the Upload-Metadata header as it is. The tus
// protocol says that a key must not be empty and must not contain spaces or commas, because the header separates the
// pairs with commas and the key from the value with a space. The client does not examine the keys, so a key with a space
// or a comma changes the pairs that the server reads: a pair can be lost, and a new key can appear.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Upload } from 'tus-js-client'

// A fake tus server that keeps the Upload-Metadata header of the creation request.
let header: string | undefined
const server = createServer((req, res) => {
  req.resume()
  const headers: Record<string, string> = { 'Tus-Resumable': '1.0.0' }
  if (req.method === 'POST') {
    header = req.headers['upload-metadata'] as string | undefined
    res.writeHead(201, { ...headers, Location: '/files/1' }).end()
  } else if (req.method === 'PATCH') {
    req.on('end', () => res.writeHead(204, { ...headers, 'Upload-Offset': '5' }).end())
  } else {
    res.writeHead(404, headers).end()
  }
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

const metadata = { filename: 'report.pdf', 'project name': 'Apollo', 'owner,team': 'ops' }
const outcome = await new Promise<string>((resolve) => {
  new Upload(Buffer.from('hello'), {
    endpoint: `${base}/files/`,
    metadata,
    retryDelays: null,
    onSuccess: () => resolve('onSuccess'),
    onError: (e) => resolve(`onError: ${e.message}`),
  }).start()
})
server.close()

// The rules of the protocol for Upload-Metadata: pairs separated by commas, then the key and the Base64 value separated
// by a space. A pair with only a key has an empty value. A pair with more than 2 parts is not valid (tusd drops it).
const read: Record<string, string> = {}
const notValid: string[] = []
for (const pair of (header ?? '').split(',')) {
  const parts = pair.trim().split(' ')
  if (parts.length === 1) read[parts[0]!] = ''
  else if (parts.length === 2) read[parts[0]!] = Buffer.from(parts[1]!, 'base64').toString()
  else notValid.push(pair)
}
console.log(`metadata of the app: ${JSON.stringify(metadata)}`)
console.log(`the upload: ${outcome}`)
console.log(`Upload-Metadata: ${header}`)
console.log(`what a server reads: ${JSON.stringify(read)}, not valid: ${JSON.stringify(notValid)}`)

const bug = outcome === 'onSuccess' && JSON.stringify(read) !== JSON.stringify(metadata)
console.log('expected: an error for each key that is empty or contains a space or a comma, and no request with that header')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
