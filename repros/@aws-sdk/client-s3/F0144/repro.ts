// F0144: @aws-sdk/client-s3 3.1171.0 with @aws-sdk/xml-builder 3.972.43. The XML parser decodes a named entity with
// AwsXmlParser.ENTITIES[name] ?? "", and ENTITIES is a plain object. Thus an entity that XML does not declare, for example
// &nbsp;, becomes "" with no error, and the name of an Object.prototype member, for example &constructor;, becomes the
// source text of a function. A local request handler gives the reply of ListObjectsV2.
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

async function listKeys(keysInXml: string[]): Promise<string> {
  const contents = keysInXml.map((key) => `<Contents><Key>${key}</Key><Size>1</Size></Contents>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>bucket</Name><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`;
  const client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "test-only" },
    requestHandler: new LocalHandler(xml),
  });
  try {
    const response = await client.send(new ListObjectsV2Command({ Bucket: "bucket" }));
    return `keys ${JSON.stringify((response.Contents ?? []).map((item) => item.Key ?? "(no key)"))}`;
  } catch (error) {
    return `throws ${(error as Error).name}: ${(error as Error).message.split("\n")[0]}`;
  }
}

// A predefined entity of XML decodes as usual.
console.log(`control <Key>a&amp;b</Key>: ${await listKeys(["a&amp;b"])}`);
let faults = 0;
for (const xml of ["a&nbsp;b", "a&constructor;b", "a&toString;b"]) {
  const result = await listKeys([xml]);
  // An undeclared entity is a fatal error in XML 1.0. A lenient parser can keep the text. It does not change the text.
  const ok = result.startsWith("throws") || result === `keys ${JSON.stringify([xml])}`;
  if (!ok) faults++;
  console.log(`${ok ? "ok   " : "FAULT"} <Key>${xml}</Key>: ${result}`);
}
if (faults > 0) {
  console.log(`BUG PRESENT: ${faults} of 3 undeclared entities change the key with no error: an unknown name becomes "", and an Object.prototype name becomes the source text of a function.`);
  process.exit(1);
}
console.log("OK: an undeclared entity gives an error or stays as it is.");
