'use strict';
// lib/utils/url.js:39-42 addPath() splits the URL on every '?' and keeps only qs[1], so a query
// that itself contains '?' (legal in a query, RFC 3986 section 3.4) loses everything after the
// second '?'. The README says: "`url` may contain a query string, if one is desired."
// Every request (/info, the transport URL, /xhr_send, /websocket) goes through addPath().
const { req, timeLimit, verdict, sockjsServer } = require('./lib');
timeLimit(20000, '04-query-with-question-mark');
const SockJS = req('sockjs-client');

(async () => {
  const srv = await sockjsServer();
  const query = '?next=/home?tab=2&token=abc';
  await new Promise((resolve) => {
    const s = new SockJS(srv.url + query, null, { transports: ['websocket'] });
    s.onopen = () => s.close();
    s.onclose = () => resolve();
  });
  const urls = srv.requests;
  const keep = urls.filter((u) => u.endsWith(query) || u.includes(query + '&'));
  const ok = verdict('the full query reaches the server on every request',
    urls.length > 0 && keep.length === urls.length,
    urls, urls.map((u) => u.replace(/\?.*$/, '') + query));
  await srv.close();
  process.exit(ok ? 0 : 1);
})();
