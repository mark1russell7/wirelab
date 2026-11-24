// F0192: tus-js-client 4.3.1. A parallel upload that resumes writes the upload URL of each part into the objects of the
// parallelUploadBoundaries option of the app (`part.uploadUrl = ...` in _startParallelUpload()). The partial uploads read
// `part.uploadUrl` again. So a later upload of a different file with the same boundaries array resumes the parts of the
// first file: it sends none of its bytes, it concatenates the old parts, and it reports success.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Upload } from 'tus-js-client'

// A fake tus server with concatenation. The parts /files/a1 and /files/a2 of an earlier upload are complete (4 of 4 bytes).
const requests: string[] = []
let next = 0
const server = createServer((req, res) => {
  const concat = req.headers['upload-concat'] as string | undefined
  requests.push(`${req.method} ${req.url}${concat ? ` (Upload-Concat: ${concat.replace(new RegExp(base, 'g'), '')})` : ''}`)
  const headers: Record<string, string> = { 'Tus-Resumable': '1.0.0', 'Cache-Control': 'no-store' }
  let received = 0
  req.on('data', (chunk: Buffer) => (received += chunk.length))
  req.on('end', () => {
    if (req.method === 'HEAD' && (req.url === '/files/a1' || req.url === '/files/a2')) {
      res.writeHead(200, { ...headers, 'Upload-Offset': '4', 'Upload-Length': '4' }).end()
    } else if (req.method === 'POST') {
      next += 1
      res.writeHead(201, { ...headers, Location: concat?.startsWith('final') ? `/files/final${next}` : `/files/p${next}` }).end()
    } else if (req.method === 'PATCH') {
      res.writeHead(204, { ...headers, 'Upload-Offset': String(Number(req.headers['upload-offset']) + received) }).end()
    } else {
      res.writeHead(404, headers).end()
    }
  })
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

// The app uses one boundaries array for each upload of 8 bytes.
const boundaries = [
  { start: 0, end: 4 },
  { start: 4, end: 8 },
]
const run = (upload: InstanceType<typeof Upload>) =>
  new Promise<string>((resolve) => {
    upload.options.onSuccess = () => resolve(`onSuccess, url ${upload.url?.replace(base, '')}`)
    upload.options.onError = (e) => resolve(`onError: ${e.message}`)
    upload.start()
  })
const options = { endpoint: `${base}/files/`, parallelUploads: 2, parallelUploadBoundaries: boundaries, retryDelays: null }

// Upload 1 resumes the parts of an earlier attempt of the same file.
const first = new Upload(Buffer.from('AAAAaaaa'), options)
const previous = { size: 8, metadata: {}, creationTime: '', urlStorageKey: 'k', parallelUploadUrls: [`${base}/files/a1`, `${base}/files/a2`] }
first.resumeFromPreviousUpload(previous as Parameters<typeof first.resumeFromPreviousUpload>[0])
console.log(`upload 1 (resumed): ${await run(first)}`)
console.log(`the boundaries of the app after upload 1: ${JSON.stringify(boundaries).replace(new RegExp(base, 'g'), '')}`)

// Upload 2 is a different file, with no previous upload.
requests.length = 0
console.log(`upload 2 (a new file, 'ZZZZzzzz'): ${await run(new Upload(Buffer.from('ZZZZzzzz'), options))}`)
console.log(`the requests of upload 2: ${requests.join(', ')}`)
server.close()

const bug = !requests.some((r) => r.startsWith('PATCH'))
console.log('expected: upload 2 creates 2 new partial uploads, sends its 8 bytes in PATCH requests, and concatenates the new parts')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
