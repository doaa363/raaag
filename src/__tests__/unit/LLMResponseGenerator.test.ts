import { LLMResponseGenerator } from '../../services/rag/core/LLMResponseGenerator';
import { AnalyzedQuery } from '../../services/rag/core/QueryAnalyzer';

describe('LLMResponseGenerator Unit Tests', () => {
  let generator: LLMResponseGenerator;

  beforeEach(() => {
    generator = new LLMResponseGenerator();
  });

  it('should generate mock response when API key is unconfigured or mock', async () => {
    const analyzed: AnalyzedQuery = {
      embedding: [0.1, 0.2],
      keywords: ['shipment', 'delay'],
      entities: { urgency: 'HIGH' },
      intent: 'COMPLAINT',
      sentiment: 0,
      language: 'en',
    };

    const docs = [
      {
        id: 'doc-1',
        content: 'Shipment 123 is experiencing minor customs delays.',
        embedding: [],
        metadata: { companyId: 'comp-1', contentType: 'SOP', sourceId: 's1', timestamp: new Date() },
        score: 0.85,
      },
    ];

    const result = await generator.generate(
      'Why is shipment delayed?',
      analyzed,
      docs,
      { userId: 'u1', companyId: 'comp-1', role: 'DISPATCHER' }
    );

    expect(result.text).toContain('[DEV MODE]');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.promptUsed).toContain('Why is shipment delayed?');
    expect(result.model).toBeDefined();
  });
});
