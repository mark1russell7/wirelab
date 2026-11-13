# The review repros of socket.io-client 4.8.4 (F0055 to F0062), against the server socket.io 4.8.4.
bash ../run-each.sh 01-volatile-before-namespace-connect.mjs 02-volatile-ack-leak.mjs \
  "03-connect-during-handshake.mjs websocket" "03-connect-during-handshake.mjs polling" \
  "04-disconnect-during-handshake.mjs 200" "04-disconnect-during-handshake.mjs 0" \
  05-zero-reconnection-options.mjs 06-recovered-undefined.mjs 07-url-no-scheme.mjs 08-emitwithack-timeout-type.mjs
