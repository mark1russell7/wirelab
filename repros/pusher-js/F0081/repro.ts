// npm install, then: npx tsc -p tsconfig.repro.json
import Pusher from "pusher-js";

const pusher = new Pusher("APP_KEY", { cluster: "mt1" });
const channel = pusher.subscribe("my-channel");

// After a pusher:subscription_count event, Channel.subscriptionCount holds the number of subscribers.
channel.bind("pusher:subscription_count", () => {
  const count: number = channel.subscriptionCount;
  console.log(`subscribers: ${count}`);
});
