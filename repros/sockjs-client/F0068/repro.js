// npm install, then: node repro.js
const http = require("http");
const SockJS = require("sockjs-client");

// a server that records each request and never answers
const requests = [];
const server = http.createServer((req) => requests.push(`${req.method} ${req.url}`));

server.listen(0, "127.0.0.1", async () => {
  const sock = new SockJS(`http://127.0.0.1:${server.address().port}/echo`);
  sock.onerror = () => console.log("error event");
  sock.onclose = (e) => console.log(`close event: code ${e.code}`);
  sock.close(); // in the same tick as the constructor

  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`requests after close(): ${JSON.stringify(requests)}`);
  console.log(`active timers: ${process.getActiveResourcesInfo().filter((r) => r === "Timeout").length}`);
  server.closeAllConnections();
  server.close();
  process.exit(0);
});
