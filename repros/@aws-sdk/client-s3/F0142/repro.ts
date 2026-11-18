// F0142: @aws-sdk/client-s3 3.1171.0 with @aws-sdk/xml-builder 3.972.43. The XML parser decodes a numeric character
// reference with String.fromCharCode(), which keeps only the low 16 bits of the code point. Thus a reference above U+FFFF
// gives a wrong character: &#x1F600; gives U+F600, and &#x10000; gives U+0000. A local request handler gives the reply of
// ListObjectsV2.
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

const codePoints = (text: string): string => [...text].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
const cases: Array<[string, string]> = [
  ["caf&#xE9;", "café"],
  ["&#x1F600;", "\u{1F600}"],
  ["&#128512;", "\u{1F600}"],
  ["a&#x10000;b", "a\u{10000}b"],
];
const keys = await listKeys(cases.map(([xml]) => xml));
let faults = 0;
for (const [i, [xml, expected]] of cases.entries()) {
  const key = keys[i] ?? "";
  const ok = key === expected;
  if (!ok) faults++;
  console.log(`${ok ? "ok   " : "FAULT"} <Key>${xml}</Key>: Key is ${codePoints(key)}, expected ${codePoints(expected)}`);
}
if (faults > 0) {
  console.log(`BUG PRESENT: ${faults} of ${cases.length} keys have a wrong character, because a numeric character reference above U+FFFF loses its high bits.`);
  process.exit(1);
}
console.log("OK: each numeric character reference gives its code point.");
