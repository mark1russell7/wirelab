// F0195: aws4fetch 1.0.20. When the app gives no service and no region, aws4fetch guesses them from the host. The guess
// knows the old S3 hosts with a dash (s3-us-west-2.amazonaws.com) only in the path style. For a bucket in the
// virtual-hosted style (my-bucket.s3-us-west-2.amazonaws.com), the guess gives the bucket name as the service and
// "s3-us-west-2" as the region. Thus the credential scope of the signature is wrong, and S3 refuses the request.
//
// The S3 guide documents these hosts in the section "Legacy endpoints", "s3-Region":
// https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html#s3-dash-region
import { AwsV4Signer } from 'aws4fetch'

const keys = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }
const cases = [
  { url: 'https://s3-us-west-2.amazonaws.com/my-bucket/key.txt', service: 's3', region: 'us-west-2' },
  { url: 'https://my-bucket.s3-us-west-2.amazonaws.com/key.txt', service: 's3', region: 'us-west-2' },
  { url: 'https://logs-2.s3-eu-west-1.amazonaws.com/key.txt', service: 's3', region: 'eu-west-1' },
  { url: 'https://my-bucket.s3-external-1.amazonaws.com/key.txt', service: 's3', region: 'us-east-1' },
]

let wrong = 0
for (const c of cases) {
  const signer = new AwsV4Signer({ ...keys, url: c.url, datetime: '20261118T120000Z' })
  const ok = signer.service === c.service && signer.region === c.region
  if (!ok) wrong += 1
  console.log(`${c.url}`)
  console.log(`  guess: service ${JSON.stringify(signer.service)}, region ${JSON.stringify(signer.region)}, scope ${signer.credentialString}`)
  console.log(`  S3 expects: service "${c.service}", region "${c.region}" ${ok ? '(same)' : '(DIFFERENT)'}`)
}

const bug = wrong > 0
console.log('expected: the service s3 and the region of the host for each S3 host with a dash, in the path style and in the virtual-hosted style')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
