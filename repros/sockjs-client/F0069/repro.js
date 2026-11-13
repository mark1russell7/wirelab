// npm install, then: node repro.js
const http = require("http");
const sockjs = require("sockjs");
const SockJS = require("sockjs-client");

// a sockjs-node server that sends three messages when a client connects
const echo = sockjs.createServer({ log: () => {} });
echo.on("connection", (conn) => {
  conn.write("1");
  conn.write("2");
  conn.write("3");
});
const server = http.createServer();
echo.installHandlers(server, { prefix: "/echo" });

server.listen(0, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}/echo`;
  const sock = new SockJS(url, null, { transports: ["xhr-polling"] });
  sock.onmessage = (e) => {
    console.log(`message "${e.data}", readyState ${sock.readyState}`);
    if (e.data === "1") sock.close();
  };
  sock.onclose = (e) => {
    console.log(`close event: code ${e.code}`);
    server.closeAllConnections();
    server.close();
  };
});
