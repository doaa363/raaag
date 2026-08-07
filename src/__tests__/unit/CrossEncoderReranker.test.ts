import { CrossEncoderReranker } from '../../services/rag/core/CrossEncoderReranker';

describe('CrossEncoderReranker Unit Tests', () => {
  let reranker: CrossEncoderReranker;

  beforeEach(() => {
    reranker = new CrossEncoderReranker();
  });

  it('should rerank documents based on content length and original score', async () => {
    const docs = [
      { id: '1', content: 'Short doc', embedding: [], metadata: { companyId: 'c', contentType: 'SOP', sourceId: 's', timestamp: new Date() }, score: 0.1 },
      { id: '2', content: 'Extremely detailed operational procedure for delayed freight handling', embedding: [], metadata: { companyId: 'c', contentType: 'SOP', sourceId: 's', timestamp: new Date() }, score: 0.8 },
    ];

    const results = await reranker.rerank('delayed freight', docs, { topK: 2 });
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('2');
  });

  it('should slice results according to topK parameter', async () => {
    const docs = [
      { id: '1', content: 'Doc A', embedding: [], metadata: { companyId: 'c', contentType: 'SOP', sourceId: 's', timestamp: new Date() }, score: 0.5 },
      { id: '2', content: 'Doc B', embedding: [], metadata: { companyId: 'c', contentType: 'SOP', sourceId: 's', timestamp: new Date() }, score: 0.6 },
      { id: '3', content: 'Doc C', embedding: [], metadata: { companyId: 'c', contentType: 'SOP', sourceId: 's', timestamp: new Date() }, score: 0.7 },
    ];

    const results = await reranker.rerank('query', docs, { topK: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('3');
  });

  it('should execute stub fineTune method without error', async () => {
    const dataset = [
      { query: 'test query', response: 'test response', label: 1 }
    ];
    await expect(reranker.fineTune(dataset)).resolves.not.toThrow();
  });
});
