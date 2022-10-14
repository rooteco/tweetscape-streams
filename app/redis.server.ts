// import { createClient } from 'redis';
// declare global {
//     var redis: ReturnType<typeof createClient>;
// }

// if (!global.redis) global.redis = createClient({ url: process.env.REDIS_URL });

// // from here: https://github.com/redis/node-redis/issues/2032#issuecomment-1255583847
// global.redis.on('error', err => console.error('client error', err));
// global.redis.on('connect', () => console.log('client is connect'));
// global.redis.on('reconnecting', () => console.log('client is reconnecting'));
// global.redis.on('ready', () => console.log('client is ready'));

// export const redis = global.redis;