# The review repros of sockjs-client 1.6.1. The case "09 main" also runs on the main branch of sockjs-client.
git clone --quiet --depth 1 https://github.com/sockjs/sockjs-client src-main
echo "sockjs-client main: $(git -C src-main rev-parse HEAD)"
bash ../run-each.sh 00-sanity.js 02b-control-native-ws.js 03-throwing-listener.js 04-query-with-question-mark.js \
  05-close-code-zero.js 06-https-page-localhost.js 07-close-while-connecting.js 08-close-while-waiting-for-load.js \
  09-stale-transport-timer.js "09-stale-transport-timer.js main" 10-node-xhr-connection-reset.js 11-transport-timer-after-close.js
