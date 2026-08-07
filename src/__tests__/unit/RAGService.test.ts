import { RAGService } from '../../services/rag/core/RAGService';
import { EmbeddingModel } from '../../services/rag/infrastructure/EmbeddingModel';
import { VectorStoreRepository } from '../../services/rag/infrastructure/VectorStoreRepository';
import { CacheManager } from '../../services/rag/infrastructure/CacheManager';
import { QueryAnalyzer } from '../../services/rag/core/QueryAnalyzer';
import { HybridRetriever } from '../../services/rag/core/HybridRetriever';
import { CrossEncoderReranker } from '../../services/rag/core/CrossEncoderReranker';
import { LLMResponseGenerator } from '../../services/rag/core/LLMResponseGenerator';

jest.mock('../../services/rag/infrastructure/EmbeddingModel');
jest.mock('../../services/rag/infrastructure/VectorStoreRepository');
jest.mock('../../services/rag/infrastructure/CacheManager');
jest.mock('../../services/rag/core/QueryAnalyzer');
jest.mock('../../services/rag/core/HybridRetriever');
jest.mock('../../services/rag/core/CrossEncoderReranker');
jest.mock('../../services/rag/core/LLMResponseGenerator');

describe('RAGService Unit Tests', () => {
  let ragService: RAGService;
  let mockEmbedding: jest.Mocked<EmbeddingModel>;
  let mockVectorStore: jest.Mocked<VectorStoreRepository>;
  let mockCache: jest.Mocked<CacheManager>;
  let mockQueryAnalyzer: jest.Mocked<QueryAnalyzer>;
  let mockRetriever: jest.Mocked<HybridRetriever>;
  let mockReranker: jest.Mocked<CrossEncoderReranker>;
  let mockLLM: jest.Mocked<LLMResponseGenerator>;

  beforeEach(() => {
    mockEmbedding = new EmbeddingModel() as jest.Mocked<EmbeddingModel>;
    mockVectorStore = new VectorStoreRepository() as jest.Mocked<VectorStoreRepository>;
    mockCache = new CacheManager() as jest.Mocked<CacheManager>;
    mockQueryAnalyzer = new QueryAnalyzer() as jest.Mocked<QueryAnalyzer>;
    mockRetriever = new HybridRetriever(mockVectorStore) as jest.Mocked<HybridRetriever>;
    mockReranker = new CrossEncoderReranker() as jest.Mocked<CrossEncoderReranker>;
    mockLLM = new LLMResponseGenerator() as jest.Mocked<LLMResponseGenerator>;

    ragService = new RAGService(
      mockEmbedding,
      mockVectorStore,
      mockCache,
      mockQueryAnalyzer,
      mockRetriever,
      mockReranker,
      mockLLM
    );
  });

  it('should return a response from cache if available', async () => {
    const cachedResponse = {
      response: 'cached response',
      confidence: 1.0,
      suggestions: [],
      provenance: { retrievedDocIds: [], prompt: 'p', model: 'm', timestamp: new Date() },
    };
    mockCache.computeKey.mockResolvedValue('cache-key-1');
    mockCache.get.mockResolvedValue(cachedResponse);

    const result = await ragService.query('test query', {
      userId: 'user-1',
      companyId: 'comp-1',
      role: 'DISPATCHER',
    });

    expect(result).toEqual(cachedResponse);
    expect(mockEmbedding.encodeText).not.toHaveBeenCalled();
  });

  it('should execute full RAG pipeline when cache misses', async () => {
    mockCache.computeKey.mockResolvedValue('cache-key-2');
    mockCache.get.mockResolvedValue(null);

    mockQueryAnalyzer.analyze.mockResolvedValue({
      embedding: [],
      keywords: ['test'],
      entities: { urgency: 'MEDIUM' },
      intent: 'GENERAL',
      sentiment: 0,
      language: 'en',
    });
    mockEmbedding.encodeText.mockResolvedValue([0.1, 0.2]);
    mockRetriever.retrieve.mockResolvedValue([]);
    mockReranker.rerank.mockResolvedValue([]);
    mockLLM.generate.mockResolvedValue({
      text: '- 1. Contact driver immediately\n- 2. Review logs',
      confidence: 0.85,
      promptUsed: 'test prompt',
      model: 'gpt-4',
    });

    const result = await ragService.query('test query', {
      userId: 'user-1',
      companyId: 'comp-1',
      role: 'DISPATCHER',
    });

    expect(mockEmbedding.encodeText).toHaveBeenCalledWith('test query');
    expect(mockLLM.generate).toHaveBeenCalled();
    expect(result.response).toContain('Contact driver');
    expect(result.suggestions).toHaveLength(2);
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('should analyze live message and return urgency and suggestions', async () => {
    mockQueryAnalyzer.analyze.mockResolvedValue({
      embedding: [],
      keywords: ['urgent'],
      entities: { urgency: 'HIGH' },
      intent: 'COMPLAINT',
      sentiment: 0,
      language: 'en',
    });
    mockCache.computeKey.mockResolvedValue('cache-key-3');
    mockCache.get.mockResolvedValue({
      response: 'Live message response',
      confidence: 0.9,
      suggestions: [{ type: 'CONTACT_DRIVER', description: 'Call driver', priority: 1, steps: [] }],
      provenance: { retrievedDocIds: [], prompt: 'p', model: 'm', timestamp: new Date() },
    });

    const analysis = await ragService.analyzeLiveMessage(
      { text: 'Urgent delay on driver route', senderId: 'u1', senderRole: 'DRIVER' },
      { companyId: 'comp-1' }
    );

    expect(analysis.urgency).toBe('HIGH');
    expect(analysis.autoReplyScore).toBe(0.9);
    expect(analysis.suggestedReply).toBe('Live message response');
  });
});
