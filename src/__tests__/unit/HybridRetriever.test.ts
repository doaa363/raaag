import { HybridRetriever } from '../../services/rag/core/HybridRetriever';
import { VectorStoreRepository } from '../../services/rag/infrastructure/VectorStoreRepository';
import { AnalyzedQuery } from '../../services/rag/core/QueryAnalyzer';

describe('HybridRetriever Unit Tests', () => {
  let retriever: HybridRetriever;
  let mockVectorStore: jest.Mocked<VectorStoreRepository>;

  beforeEach(() => {
    mockVectorStore = new VectorStoreRepository() as jest.Mocked<VectorStoreRepository>;
    mockVectorStore.similaritySearch = jest.fn();
    retriever = new HybridRetriever(mockVectorStore);
  });

  it('should call similaritySearch with analyzed embedding and companyId filter', async () => {
    const mockDocs = [
      {
        id: 'doc-1',
        content: 'Logistics delay document',
        embedding: [0.1, 0.2],
        metadata: { companyId: 'comp-123', contentType: 'SOP', sourceId: 'src-1', timestamp: new Date() },
        score: 0.9,
      },
    ];
    mockVectorStore.similaritySearch.mockResolvedValue(mockDocs as any);

    const analyzed: AnalyzedQuery = {
      embedding: [0.1, 0.2, 0.3],
      keywords: ['delay'],
      entities: { urgency: 'HIGH' },
      intent: 'COMPLAINT',
      sentiment: 0,
      language: 'en',
    };

    const results = await retriever.retrieve(
      analyzed,
      { userId: 'usr-1', companyId: 'comp-123', role: 'DISPATCHER' },
      { vectorWeight: 0.6, keywordWeight: 0.3, graphWeight: 0.1 }
    );

    expect(mockVectorStore.similaritySearch).toHaveBeenCalledWith([0.1, 0.2, 0.3], {
      companyId: 'comp-123',
      limit: 50,
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('doc-1');
  });
});
