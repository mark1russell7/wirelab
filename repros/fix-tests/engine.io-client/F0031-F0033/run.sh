# F0031 (abort the polling requests on close) and F0033 (the types of perMessageDeflate and send).
bash ../test-branches.sh "F0031|fix/eio-client-abort-requests-on-close|--grep long-polling test/node.js" "F0033|fix/eio-client-types|--grep callback test/connection.js"
