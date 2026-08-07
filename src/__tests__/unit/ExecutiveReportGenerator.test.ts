import { ExecutiveReportGenerator } from '../../services/rag/reporting/ExecutiveReportGenerator';
import { RAGService } from '../../services/rag/core/RAGService';

describe('ExecutiveReportGenerator Unit Tests', () => {
  let generator: ExecutiveReportGenerator;
  let mockRAGService: jest.Mocked<RAGService>;

  beforeEach(() => {
    mockRAGService = {
      query: jest.fn().mockResolvedValue({
        response: 'Executive report summary generated cleanly.',
        confidence: 0.95,
        suggestions: [
          { type: 'CONTACT_DRIVER', description: 'Optimize driver routing', priority: 1, steps: [] },
        ],
        provenance: { retrievedDocIds: [], prompt: 'p', model: 'm', timestamp: new Date() },
      }),
    } as unknown as jest.Mocked<RAGService>;

    generator = new ExecutiveReportGenerator(mockRAGService);
  });

  it('should generate an executive report with summary and PDF path', async () => {
    const start = new Date('2026-08-01');
    const end = new Date('2026-08-07');

    const report = await generator.generateReport('comp-777', start, end, 'user-admin');

    expect(report.title).toContain('Executive Summary');
    expect(report.summary).toContain('Executive report summary');
    expect(report.keyFindings).toContain('Optimize driver routing');
    expect(report.pdfUrl).toMatch(/\/reports\/report_.*\.pdf/);
    expect(mockRAGService.query).toHaveBeenCalled();
  });
});
