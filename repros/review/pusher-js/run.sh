# The review repros of pusher-js 8.6.0.
bash ../run-each.sh 02-handshake-pusher-error-no-code.js "02-handshake-pusher-error-no-code.js missing" \
  04-channel-name-prototype-keys.js 05-unsubscribe-lost-on-reconnect.js 06-falsy-event-data-dropped.js \
  07-presence-auth-errors.js 08-stale-retry-timer.js "08-stale-retry-timer.js connect" \
  09-disconnect-ignored-after-backoff-close.js
