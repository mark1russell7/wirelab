// npm install, then: npx tsc -p tsconfig.repro.json
import Pusher from "pusher-js";

// The configuration example of the README. The README says that the endpoint and the transport
// ("ajax") have defaults, and pusher-js merges these defaults at run time.
export const pusher = new Pusher("APP_KEY", {
  cluster: "mt1",
  channelAuthorization: {
    endpoint: "http://example.com/pusher/auth",
  },
});

// The same for userAuthentication: the README gives the default endpoint /pusher/user-auth.
export const signedIn = new Pusher("APP_KEY", {
  cluster: "mt1",
  userAuthentication: {
    endpoint: "http://example.com/pusher/user-auth",
  },
});
