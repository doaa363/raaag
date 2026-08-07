import { QueryAnalyzer } from '../../services/rag/core/QueryAnalyzer';

describe('QueryAnalyzer Unit Tests', () => {
  let analyzer: QueryAnalyzer;

  beforeEach(() => {
    analyzer = new QueryAnalyzer();
  });

  it('should detect high urgency for urgent words', async () => {
    const result = await analyzer.analyze('Urgent delivery problem with shipment', {
      userId: 'user-1',
      companyId: 'company-1',
      role: 'DISPATCHER',
    });
    expect(result.entities.urgency).toBe('HIGH');
    expect(result.intent).toBe('COMPLAINT');
    expect(result.language).toBe('en');
  });

  it('should detect medium urgency when no urgent keywords are present', async () => {
    const result = await analyzer.analyze('Where is the driver currently located?', {
      userId: 'user-1',
      companyId: 'company-1',
      role: 'DISPATCHER',
    });
    expect(result.entities.urgency).toBe('MEDIUM');
    expect(result.intent).toBe('GENERAL');
  });

  it('should detect Arabic language and extract keywords', async () => {
    const result = await analyzer.analyze('تأخير حاد في تسليم الشحنة', {
      userId: 'user-1',
      companyId: 'company-1',
      role: 'DISPATCHER',
    });
    expect(result.language).toBe('ar');
    expect(result.keywords.length).toBeGreaterThan(0);
  });

  it('should detect report issue, request help, and feedback intents', async () => {
    const reportRes = await analyzer.analyze('Please report this issue to manager', {
      userId: 'u', companyId: 'c', role: 'MANAGER'
    });
    expect(reportRes.intent).toBe('REPORT_ISSUE');

    const helpRes = await analyzer.analyze('I need support and help with customer', {
      userId: 'u', companyId: 'c', role: 'MANAGER'
    });
    expect(helpRes.intent).toBe('REQUEST_HELP');

    const feedbackRes = await analyzer.analyze('Submitting feedback for previous delivery', {
      userId: 'u', companyId: 'c', role: 'MANAGER'
    });
    expect(feedbackRes.intent).toBe('FEEDBACK');
  });
});
