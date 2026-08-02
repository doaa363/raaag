import { UserContext } from '../../../types/rag.types';

export interface AnalyzedQuery {
  embedding: number[];
  keywords: string[];
  entities: {
    shipmentId?: string;
    driverId?: string;
    incidentType?: string;
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  intent: 'COMPLAINT' | 'REPORT_ISSUE' | 'REQUEST_HELP' | 'FEEDBACK' | 'GENERAL';
  sentiment: number;
  language: 'ar' | 'en';
}

export class QueryAnalyzer {
  async analyze(rawQuery: string, context: UserContext): Promise<AnalyzedQuery> {
    return {
      embedding: [],
      keywords: rawQuery.split(/\s+/).filter(w => w.length > 2),
      entities: {
        urgency: this.detectUrgency(rawQuery),
        shipmentId: context.shipmentId,
      },
      intent: this.detectIntent(rawQuery),
      sentiment: 0,
      language: this.detectLanguage(rawQuery),
    };
  }

  private detectUrgency(text: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const urgentWords = ['urgent', 'critical', 'emergency', 'immediate', 'high', 'serious'];
    if (urgentWords.some(w => text.toLowerCase().includes(w))) return 'HIGH';
    return 'MEDIUM';
  }

  private detectIntent(text: string): 'COMPLAINT' | 'REPORT_ISSUE' | 'REQUEST_HELP' | 'FEEDBACK' | 'GENERAL' {
    const lower = text.toLowerCase();
    if (lower.includes('complaint') || lower.includes('problem')) return 'COMPLAINT';
    if (lower.includes('report') || lower.includes('issue')) return 'REPORT_ISSUE';
    if (lower.includes('help') || lower.includes('support')) return 'REQUEST_HELP';
    if (lower.includes('feedback')) return 'FEEDBACK';
    return 'GENERAL';
  }

  private detectLanguage(text: string): 'ar' | 'en' {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? 'ar' : 'en';
  }
}
