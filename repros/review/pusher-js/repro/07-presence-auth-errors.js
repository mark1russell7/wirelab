'use strict';
// PresenceChannel.authorize wraps the authorizer callback in an async
// function. Case A: the auth response has channel_data that is not a JSON
// string (here an object, a common mistake). JSON.parse throws inside the
// async callback -> an unhandled promise rejection (fatal by default in
// Node.js >= 15), the subscribe callback is never called, and the channel
// stays subscriptionPending for ever, with no pusher:subscription_error.
// Case B: the auth response has no channel_data and the user is not signed
// in. The code calls callback('Invalid auth response') with a string, so
// Channel.subscribe emits pusher:subscription_error with error: undefined
// (error.message of a string).
// Expected: in both cases one pusher:subscription_error with a message, no
// unhandled rejection, subscriptionPending=false.
const { startServer, client, waitFor, run, shutdown } = require('./lib/harness');

run('07 presence auth errors', async () => {
  const rejections = [];
  process.on('unhandledRejection', (e) => rejections.push(String(e && e.message || e)));
  const server = await startServer();
  const authResponses = {
    'presence-a': { auth: 'app-key:sig', channel_data: { user_id: 'u1', user_info: {} } },
    'presence-b': { auth: 'app-key:sig' },
  };
  const pusher = client(server.port, {
    channelAuthorization: {
      customHandler: (params, cb) => setTimeout(() => cb(null, authResponses[params.channelName]), 10),
    },
  });
  await waitFor(() => pusher.connection.state === 'connected', 5000);
  const out = {};
  for (const name of Object.keys(authResponses)) {
    const ch = pusher.subscribe(name);
    out[name] = { errors: [], ch };
    ch.bind('pusher:subscription_error', (e) => out[name].errors.push(e));
  }
  await waitFor(() => false, 500);
  const a = out['presence-a'];
  const b = out['presence-b'];
  const aOk = a.errors.length === 1 && rejections.length === 0 && a.ch.subscriptionPending === false;
  const bOk = b.errors.length === 1 && typeof b.errors[0].error === 'string';
  const result = {
    pass: aOk && bOk,
    actual: `A: subscription_error events=${a.errors.length} subscriptionPending=${a.ch.subscriptionPending} unhandledRejections=[${rejections}] | B: subscription_error=${JSON.stringify(b.errors)}`,
    expected: 'A: one subscription_error, subscriptionPending=false, no unhandled rejection | B: one subscription_error with error="Invalid auth response" (a string)',
  };
  await shutdown(server, pusher);
  return result;
}, 15000);
