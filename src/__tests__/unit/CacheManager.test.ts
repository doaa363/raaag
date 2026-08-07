import { CacheManager } from '../../services/rag/infrastructure/CacheManager';

describe('CacheManager Unit Tests', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  it('should compute deterministic MD5 key for query and context', async () => {
    const key1 = await cacheManager.computeKey('status of shipment', { companyId: 'c1', role: 'DISPATCHER' });
    const key2 = await cacheManager.computeKey('status of shipment', { companyId: 'c1', role: 'DISPATCHER' });
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(32);
  });

  it('should handle offline redis gracefully for get, set, delete, clearPattern', async () => {
    const val = await cacheManager.get('some-key');
    expect(val).toBeNull();

    await expect(cacheManager.set('key', { a: 1 }, { ttl: 100 })).resolves.not.toThrow();
    await expect(cacheManager.delete('key')).resolves.not.toThrow();
    await expect(cacheManager.clearPattern('*')).resolves.not.toThrow();
  });
});
