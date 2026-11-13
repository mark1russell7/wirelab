# The fix branches of socket.io-client 4.8.4 for F0055, F0056 and F0057. Each item: finding|branch|test file|grep.
bash ../test-branches.sh \
  "F0055|fix/sio-client-volatile-not-connected|test/socket.ts|volatile packet when the namespace is not connected" \
  "F0056|fix/sio-client-volatile-ack-leak|test/socket.ts|discarded volatile packet|volatile packet is discarded" \
  "F0057|fix/sio-client-connect-during-handshake|test/connection.ts|second CONNECT packet"
