# The fix branches of socket.io-client 4.8.4 for F0055 to F0062, except F0058. Each item: finding|branch|test file|grep.
bash ../test-branches.sh \
  "F0055|fix/sio-client-volatile-not-connected|test/socket.ts|volatile packet when the namespace is not connected" \
  "F0056|fix/sio-client-volatile-ack-leak|test/socket.ts|discarded volatile packet|volatile packet is discarded" \
  "F0057|fix/sio-client-connect-during-handshake|test/connection.ts|second CONNECT packet" \
  "F0059|fix/sio-client-zero-reconnection-options|test/connection.ts|0 as the value of the reconnection options|zero attempts" \
  "F0060|fix/sio-client-recovered-boolean|test/connection-state-recovery.ts|should not be recovered" \
  "F0061|fix/sio-client-url-no-scheme|test/url.ts|no protocol and no location" \
  "F0062|fix/sio-client-timeout-emitwithack-type|-|"
