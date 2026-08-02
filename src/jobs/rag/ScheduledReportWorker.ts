import { ExecutiveReportGenerator } from '../../services/rag/reporting/ExecutiveReportGenerator';

export class ScheduledReportWorker {
  constructor(private reportGenerator: ExecutiveReportGenerator) {}

  async generateWeeklyReports(companyIds: string[]): Promise<void> {
    const end = new Date();
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const companyId of companyIds) {
      await this.reportGenerator.generateReport(companyId, start, end, 'scheduler-system');
    }
  }
}
