'use strict';
// On a page loaded over https, lib/main.js:78-83 throws SecurityError for every http: URL except
// 127.0.0.0/8 and [::1] (lib/utils/url.js:48-50). It throws for http://localhost/ and
// http://*.localhost/, which the Secure Contexts spec ("Is origin potentially trustworthy?",
// section 3.1) counts as potentially trustworthy, so Mixed Content does not block them and
// browsers allow `new WebSocket('ws://localhost:...')` from an https page.
// The code comment names the intent: "exception is 127.0.0.0/8 and ::1 urls".
// Browser setting stood in by global.location (lib/location.js reads it at require time).
const { req, timeLimit, verdict, rawServer, sleep } = require('./lib');
timeLimit(20000, '06-https-page-localhost');
global.location = {
  protocol: 'https:', href: 'https://app.example/', host: 'app.example', hostname: 'app.example',
  port: '', hash: '', origin: 'https://app.example', pathname: '/', search: '',
};
const SockJS = req('sockjs-client');

(async () => {
  const srv = await rawServer((r, res) => { res.writeHead(404); res.end(); });
  const out = {};
  for (const host of ['127.0.0.1', '[::1]', 'localhost', 'app.localhost']) {
    try {
      const s = new SockJS(`http://${host}:${srv.port}/echo`);
      s.onclose = () => {};
      s.close();
      out[host] = 'allowed';
    } catch (e) {
      out[host] = 'throws ' + e.message.slice(0, 40);
    }
  }
  await sleep(200);
  const exp = { '127.0.0.1': 'allowed', '[::1]': 'allowed', localhost: 'allowed', 'app.localhost': 'allowed' };
  const ok = verdict('loopback names that a browser treats as potentially trustworthy are allowed',
    JSON.stringify(out) === JSON.stringify(exp), out, exp);
  await srv.close();
  process.exit(ok ? 0 : 1);
})();
