// =============================================================================
// NoverThinker - Redis Configuration
// =============================================================================

const { createClient } = require('redis');

let redisClient = null;
let redisConnected = false;

const connectRedis = async () => {
  // Skip Redis in development if not accessible
  if (process.env.SKIP_REDIS === 'true') {
    console.log('⏭️  Redis skipped (SKIP_REDIS=true)');
    return null;
  }

  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379,
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 2) {
            console.log('⚠️  Redis unavailable - running without cache');
            return false; // Stop reconnecting
          }
          return 1000; // Retry after 1 second
        }
      }
    });

    redisClient.on('error', (err) => {
      if (redisConnected) {
        console.error('❌ Redis error:', err.message);
      }
    });

    redisClient.on('connect', () => {
      redisConnected = true;
      console.log('🔴 Redis connected');
    });

    redisClient.on('end', () => {
      redisConnected = false;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.log('⚠️  Redis unavailable - running without cache');
    return null;
  }
};

const getRedisClient = () => redisClient;

// Cache helpers
const cache = {
  async get(key) {
    if (!redisClient || !redisConnected) return null;
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  },

  async set(key, value, ttlSeconds = 3600) {
    if (!redisClient || !redisConnected) return false;
    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  },

  async del(key) {
    if (!redisClient || !redisConnected) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      return false;
    }
  },

  async delPattern(pattern) {
    if (!redisClient || !redisConnected) return false;
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return true;
    } catch (error) {
      return false;
    }
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  cache
};