// F0188: tus-js-client 4.3.1. The URL storage of Node.js (FileUrlStorage) finds the stored uploads of a fingerprint by a
// prefix of the key. The key is `tus::<fingerprint>::<id>`, but the search prefix is `tus::<fingerprint>`, with no `::`
// at the end. So findPreviousUploads() for the fingerprint "photo-1" also gives the uploads of "photo-12". The browser
// storage searches with `tus::<fingerprint>::` and does not do this.
//
// When the app resumes such an entry (the pattern of the README), the upload of one file continues at the upload URL of
// another file. Here the upload of photo-12 is complete, so the upload of photo-1 reports success and sends no byte.
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as tus from 'tus-js-client'

// The Node.js build exports FileUrlStorage, and the README tells to use it. The types of 4.3.1 do not declare it.
const { FileUrlStorage, Upload } = tus as typeof tus & { FileUrlStorage: new (path: string) => NonNullable<tus.UploadOptions['urlStorage']> }

// A fake tus server. The upload of photo-12 at /files/photo-12 is complete: 12 of 12 bytes.
const requests: string[] = []
const server = createServer((req, res) => {
  requests.push(`${req.method} ${req.url}`)
  req.resume()
  const headers: Record<string, string> = { 'Tus-Resumable': '1.0.0', 'Cache-Control': 'no-store' }
  if (req.method === 'HEAD' && req.url === '/files/photo-12') {
    res.writeHead(200, { ...headers, 'Upload-Offset': '12', 'Upload-Length': '12' }).end()
  } else if (req.method === 'POST') {
    res.writeHead(201, { ...headers, Location: '/files/photo-1' }).end()
  } else if (req.method === 'PATCH') {
    req.on('end', () => res.writeHead(204, { ...headers, 'Upload-Offset': req.headers['upload-offset'] === '0' ? '9' : '0' }).end())
  } else {
    res.writeHead(404, headers).end()
  }
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

const dir = mkdtempSync(join(tmpdir(), 'f0188-'))
const urlStorage = new FileUrlStorage(join(dir, 'uploads.json'))

// An earlier upload of the file photo-12 is in the storage. No upload of photo-1 is in it.
const photo12 = { size: 12, metadata: {}, creationTime: new Date().toString(), uploadUrl: `${base}/files/photo-12` }
await urlStorage.addUpload('photo-12', photo12 as Parameters<typeof urlStorage.addUpload>[1])

const upload = new Upload(Buffer.from('photo one'), {
  endpoint: `${base}/files/`,
  fingerprint: async () => 'photo-1',
  urlStorage,
  retryDelays: null,
})
const previous = await upload.findPreviousUploads()
console.log(`findUploadsByFingerprint('photo-1'): ${JSON.stringify(previous.map((p) => p.urlStorageKey?.replace(/::\d+$/, '::<id>')))}`)

// The README pattern: resume the first previous upload, if there is one.
if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]!)
const outcome = await new Promise<string>((resolve) => {
  upload.options.onSuccess = () => resolve('onSuccess')
  upload.options.onError = (e) => resolve(`onError: ${e.message}`)
  upload.start()
})
console.log(`the upload of photo-1 (9 bytes): ${outcome}, upload.url = ${upload.url?.replace(base, '')}`)
console.log(`the requests of the server: ${requests.join(', ')}`)

server.close()
rmSync(dir, { recursive: true, force: true })
const bug = previous.length > 0
console.log("expected: findUploadsByFingerprint('photo-1') gives [], and the upload creates /files/photo-1 and sends its 9 bytes")
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
