# The fix branches of sockjs-client for F0068 (#711) and F0069 (#712).
node test-branches.ts "F0068|fix/info-receiver-close-timer|should not start the info request" "F0069|fix/no-message-after-close|should not dispatch the rest of a frame"
