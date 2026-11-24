// Repro for F0220: @neondatabase/serverless 1.2.1, Pool.query
// over HTTP (poolQueryViaFetch) with a password function.
//
// node-postgres accepts a password function, and neon() resolves one. The
// HTTP path of Pool.query builds the connection string with
// encodeURIComponent(password), so the server gets the source text of the
// function as the password. The fetch function here is a stub: no network.
import { Pool, neon, neonConfig } from "@neondatabase/serverless";

const sent: string[] = [];
neonConfig.poolQueryViaFetch = true;
neonConfig.fetchEndpoint = () => "https://db.example.invalid/sql";
neonConfig.fetchFunction = async (_url: string, init: { headers: Record<string, string> }) => {
  sent.push(new URL(init.headers["Neon-Connection-String"]!.replace(/^postgresql:/, "http:")).password);
  return new Response(JSON.stringify({ fields: [], rows: [], command: "SELECT", rowCount: 0 }));
};

const password = async () => "secret-from-function";
const params = { host: "ep-x.example.com", user: "app", database: "app", password };

await neon(params).query("SELECT 1");
const pool = new Pool(params);
await pool.query("SELECT 1");

const [viaNeon, viaPool] = sent.map(decodeURIComponent);
console.log(`password sent by neon():      ${JSON.stringify(viaNeon)}`);
console.log(`password sent by Pool.query(): ${JSON.stringify(viaPool)}`);
console.log(viaPool === "secret-from-function" ? "BUG ABSENT" : "BUG PRESENT");
