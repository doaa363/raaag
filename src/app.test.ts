import { QueryAnalyzer } from './services/rag/core/QueryAnalyzer';
import { CrossEncoderReranker } from './services/rag/core/CrossEncoderReranker';
import { TimeSeriesModel } from './services/rag/predictive/TimeSeriesModel';

describe('LogiCore RAG System Unit Tests', () => {
  test('QueryAnalyzer detects language and intent correctly', async () => {
    const analyzer = new QueryAnalyzer();
    const result = await analyzer.analyze('Urgent problem with shipment delivery', {
      userId: 'test-user',
      companyId: 'test-company',
      role: 'DISPATCHER',
    });

    expect(result.language).toBe('en');
    expect(result.intent).toBe('COMPLAINT');
    expect(result.entities.urgency).toBe('HIGH');
  });

  test('QueryAnalyzer detects Arabic language', async () => {
    const analyzer = new QueryAnalyzer();
    const result = await analyzer.analyze('تأخير في تسليم الشحنة', {
      userId: 'test-user',
      companyId: 'test-company',
      role: 'DISPATCHER',
    });

    expect(result.language).toBe('ar');
  });

  test('CrossEncoderReranker sorts documents by score', async () => {
    const reranker = new CrossEncoderReranker();
    const docs = [
      { id: '1', content: 'Short', embedding: [], metadata: { companyId: 'c1', contentType: 'SOP', sourceId: 's1', timestamp: new Date() }, score: 0.2 },
      { id: '2', content: 'Long document text content for logistics', embedding: [], metadata: { companyId: 'c1', contentType: 'SOP', sourceId: 's2', timestamp: new Date() }, score: 0.9 },
    ];

    const reranked = await reranker.rerank('test query', docs, { topK: 2 });
    expect(reranked[0].id).toBe('2');
  });

  test('TimeSeriesModel computes delay risk score', async () => {
    const model = new TimeSeriesModel();
    const risk = await model.predict([0.8, 0.9, 0.2, 0.5, 0.3, 0.4]);
    expect(risk).toBeGreaterThan(0);
    expect(risk).toBeLessThanOrEqual(1);
  });
});
