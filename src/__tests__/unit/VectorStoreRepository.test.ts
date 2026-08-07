import { VectorStoreRepository } from '../../services/rag/infrastructure/VectorStoreRepository';

describe('VectorStoreRepository Unit Tests', () => {
  let vectorStore: VectorStoreRepository;

  beforeEach(() => {
    vectorStore = new VectorStoreRepository();
  });

  it('should insert document and retrieve via in-memory similarity fallback', async () => {
    const doc = {
      id: 'vdoc-1',
      content: 'Custom logistics policy for hazmat',
      embedding: [0.1, 0.2, 0.3],
      metadata: {
        companyId: 'comp-99',
        contentType: 'ATTACHMENT' as const,
        sourceId: 'src-99',
        timestamp: new Date(),
        tags: ['HAZMAT'],
      },
    };

    await vectorStore.insert(doc);

    const results = await vectorStore.similaritySearch([0.1, 0.2, 0.3], {
      companyId: 'comp-99',
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('vdoc-1');
    expect(results[0].content).toContain('Custom logistics policy');
  });

  it('should delete documents by sourceId', async () => {
    const doc = {
      id: 'vdoc-2',
      content: 'Temporary shipment manifest',
      embedding: [0.5, 0.5],
      metadata: {
        companyId: 'comp-99',
        contentType: 'ATTACHMENT' as const,
        sourceId: 'src-delete-me',
        timestamp: new Date(),
      },
    };

    await vectorStore.insert(doc);
    await vectorStore.delete('src-delete-me');

    const results = await vectorStore.similaritySearch([0.5, 0.5], {
      companyId: 'comp-99',
    });

    expect(results.find(d => d.id === 'vdoc-2')).toBeUndefined();
  });

  it('should support reindexAll without throwing', async () => {
    await expect(vectorStore.reindexAll()).resolves.not.toThrow();
  });
});
