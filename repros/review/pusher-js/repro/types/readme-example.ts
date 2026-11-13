// The README "Configuration" example, and the documented subscription count.
import Pusher from 'pusher-js';

const pusher = new Pusher('APP_KEY', {
  cluster: 'mt1',
  channelAuthorization: {
    endpoint: 'http://example.com/pusher/auth',
  },
});

const channel = pusher.subscribe('my-channel');
channel.bind('pusher:subscription_count', () => {
  const next: number = channel.subscriptionCount + 1;
  console.log(next);
});
