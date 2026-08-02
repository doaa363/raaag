import { createClient, RedisClientType } from 'redis';
import crypto from 'crypto';
import config from '../../../config';

export class CacheManager {
  private client: RedisClientType;
  private connected = false;

  constructor() {
    this.client = createClient({ url: config.rag.redisUrl }) as RedisClientType;
    this.client.connect()
      .then(() => { this.connected = true; })
      .catch(() => {
        console.warn('Redis unavailable. Cache disabled.');
      });
  }

  async computeKey(query: string, context: any): Promise<string> {
    const raw = `${query}|${context.companyId}|${context.role}`;
    return crypto.createHash('md5').update(raw).digest('hex');
  }

  async get(key: string): Promise<any | null> {
    if (!this.connected) return null;
    try {
      const val = await this.client.get(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: any, options: { ttl: number }): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.setEx(key, options.ttl, JSON.stringify(value));
    } catch {
      // Cache write failure is non-critical
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.del(key);
    } catch { /* noop */ }
  }

  async clearPattern(pattern: string): Promise<void> {
    if (!this.connected) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length) {
        await this.client.del(keys);
      }
    } catch { /* noop */ }
  }
}
