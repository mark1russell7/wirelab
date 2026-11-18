// F0143: @aws-sdk/client-s3 3.1171.0 with @aws-sdk/xml-builder 3.972.43. The XML parser gives "" for an element value
// that has only white space and a line feed. It applies this rule after it decodes the character references. Thus an
// object key that is only white space with a line feed, for example the key "\n" written as &#10;, becomes the key "".
// A local request handler gives the reply of ListObjectsV2.
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { HttpResponse } from "@smithy/core/transport";
import { Readable } from "node:stream";

class LocalHandler {
  readonly xml: string;
  constructor(xml: string) {
    this.xml = xml;
  }
  async handle(): Promise<{ response: HttpResponse }> {
    const headers = { "content-type": "application/xml" };
    return { response: new HttpResponse({ statusCode: 200, headers, body: Readable.from([Buffer.from(this.xml)]) }) };
  }
  updateHttpClientConfig(): void {}
  httpHandlerConfigs(): Record<string, never> {
    return {};
  }
}

async function listKeys(keysInXml: string[]): Promise<string[]> {
  const contents = keysInXml.map((key) => `<Contents><Key>${key}</Key><Size>1</Size></Contents>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>bucket</Name><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`;
  const client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "test-only" },
    requestHandler: new LocalHandler(xml),
  });
  const response = await client.send(new ListObjectsV2Command({ Bucket: "bucket" }));
  return (response.Contents ?? []).map((item) => item.Key ?? "(no key)");
}

const cases: Array<[string, string]> = [
  ["a&#10;", "a\n"],
  ["&#9;", "\t"],
  ["&#10;", "\n"],
  ["&#13;&#10;", "\r\n"],
  [" &#10; ", " \n "],
];
const keys = await listKeys(cases.map(([xml]) => xml));
let faults = 0;
for (const [i, [xml, expected]] of cases.entries()) {
  const key = keys[i] ?? "";
  const ok = key === expected;
  if (!ok) faults++;
  console.log(`${ok ? "ok   " : "FAULT"} <Key>${xml}</Key>: Key is ${JSON.stringify(key)}, expected ${JSON.stringify(expected)}`);
}
if (faults > 0) {
  console.log(`BUG PRESENT: ${faults} of ${cases.length} keys become "", because the parser removes white space that character references give.`);
  process.exit(1);
}
console.log("OK: each key keeps the characters of its character references.");
