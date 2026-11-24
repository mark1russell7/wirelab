// F0196: aws4fetch 1.0.20. When the app gives no service, aws4fetch guesses it from the host. For an S3 access point host
// (my-ap-111122223333.s3-accesspoint.us-west-2.amazonaws.com), the guess gives the service "s3-accesspoint". The signing
// name of S3 access points is "s3". Thus the credential scope of the signature is wrong, the S3 rules of aws4fetch do not
// apply (the header X-Amz-Content-Sha256: UNSIGNED-PAYLOAD), and S3 refuses the request.
//
// The S3 endpoint rules of the AWS SDKs give the signing name "s3" to the s3-accesspoint hosts, for example
// service/s3/endpoints.go of aws-sdk-go-v2: `smithyhttp.SetSigV4SigningName(&sp, "s3")`.
import { AwsV4Signer } from 'aws4fetch'

const keys = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }
const datetime = '20261118T120000Z'
const urls = [
  'https://my-ap-111122223333.s3-accesspoint.us-west-2.amazonaws.com/key.txt',
  'https://my-ap-111122223333.s3-accesspoint.dualstack.us-west-2.amazonaws.com/key.txt',
  'https://my-ap-111122223333.s3-accesspoint-fips.us-east-1.amazonaws.com/key.txt',
]

let wrong = 0
for (const url of urls) {
  const guessed = new AwsV4Signer({ ...keys, url, datetime })
  const s3 = new AwsV4Signer({ ...keys, url, datetime, service: 's3', region: guessed.region })
  const same = guessed.credentialString === s3.credentialString && guessed.signedHeaders === s3.signedHeaders
  if (!same) wrong += 1
  console.log(url)
  console.log(`  guess:      service ${JSON.stringify(guessed.service)}, scope ${guessed.credentialString}, signed headers ${guessed.signedHeaders}`)
  console.log(`  service s3: service "s3", scope ${s3.credentialString}, signed headers ${s3.signedHeaders} ${same ? '(same)' : '(DIFFERENT)'}`)
}

const bug = wrong > 0
console.log('expected: the guess gives the service s3 for each S3 access point host')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exitCode = bug ? 1 : 0
