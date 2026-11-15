// npm install, then: npx tsc -p tsconfig.repro.json
import PartySocket from "partysocket";

// This works at run time: the URL is https://example.com/custom/route.
await PartySocket.fetch({ host: "example.com", basePath: "custom/route" });

// The same options compile for the socket.
new PartySocket({ host: "example.com", basePath: "custom/route" });
