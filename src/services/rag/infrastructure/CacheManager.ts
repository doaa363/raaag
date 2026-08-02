import { createClient, RedisClientType } from 'redis';
import crypto from 'crypto';
import config from '../../../config';

export class CacheManager {
  private client: RedisClientType;
  private memoryCache: Map<string, { value: any; expires: number }> = new Map();
  private isConnected = false;

  constructor() {
    this.client = createClient({ url: config.rag.redisUrl });
    this.client.on('error', (err) => {
      this.isConnected = false;
    });
    this.client.connect().then(() => {
      this.isConnected = true;
    }).catch(() => {
      this.isConnected = false;
    });
  }

  async computeKey(query: string, context: any): Promise<string> {
    const raw = `${query}|${context.companyId}|${context.role}`;
    return crypto.createHash('md5').update(raw).digest('hex');
  }

  async get(key: string): Promise<any | null> {
    if (this.isConnected) {
      try {
        const val = await this.client.get(key);
        return val ? JSON.parse(val) : null;
      } catch (err) {
        // Fallback to in-memory cache
      }
    }
    const item = this.memoryCache.get(key);
    if (item && item.expires > Date.now()) {
      return item.value;
    }
    return null;
  }

  async set(key: string, value: any, options: { ttl: number }): Promise<void> {
    if (this.isConnected) {
      try {
        await this.client.setEx(key, options.ttl, JSON.stringify(value));
        return;
      } catch (err) {
        // Fallback
      }
    }
    this.memoryCache.set(key, { value, expires: Date.now() + options.ttl * 1000 });
  }

  async delete(key: string): Promise<void> {
    if (this.isConnected) {
      try {
        await this.client.del(key);
      } catch (err) {}
    }
    this.memoryCache.delete(key);
  }

  async clearPattern(pattern: string): Promise<void> {
    if (this.isConnected) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys.length) {
          await this.client.del(keys);
        }
      } catch (err) {}
    }
    this.memoryCache.clear();
  }
}
