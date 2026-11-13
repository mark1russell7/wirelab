# The fix branches of socket.io-client 4.8.4 for F0059 to F0062. Each item: finding|branch|test file|grep.
bash ../test-branches.sh \
  "F0059|fix/sio-client-zero-reconnection-options|test/connection.ts|0 as the value of the reconnection options|zero attempts" \
  "F0060|fix/sio-client-recovered-boolean|test/connection-state-recovery.ts|should not be recovered" \
  "F0061|fix/sio-client-url-no-scheme|test/url.ts|no protocol and no location" \
  "F0062|fix/sio-client-timeout-emitwithack-type|-|"
