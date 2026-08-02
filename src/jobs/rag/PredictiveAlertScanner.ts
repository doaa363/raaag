import { PredictiveAlertEngine } from '../../services/rag/predictive/PredictiveAlertEngine';

export class PredictiveAlertScanner {
  constructor(private alertEngine: PredictiveAlertEngine) {}

  async runScan(companyIds: string[]): Promise<void> {
    for (const companyId of companyIds) {
      await this.alertEngine.scanCompany(companyId);
    }
  }
}
