
export type InsightType = 'RECOMMENDATION' | 'PREDICTIVE_ALERT' | 'EXECUTIVE_SUMMARY' | 'ESCALATION_BRIEF';

export interface Action {
  type: 'APPROVE' | 'DELEGATE' | 'REFUND' | 'REPLACE' | 'ESCALATE' | 'CONTACT_DRIVER' | 'CONTACT_CUSTOMER';
  description: string;
  assignedTo?: string;
  priority?: number;
  steps?: string[];
  expectedOutcome?: string;
}

export interface UserContext {
  userId: string;
  companyId: string;
  role: string;
  departmentId?: string;
  shipmentId?: string;
  incidentId?: string;
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    companyId: string;
    contentType: string;
    sourceId: string;
    timestamp: Date;
    tags?: string[];
    damageScore?: number;
    fileType?: string;
  };
  score?: number;
}

export interface RAGResponse {
  response: string;
  confidence: number;
  suggestions: Action[];
  provenance: {
    retrievedDocIds: string[];
    prompt: string;
    model: string;
    timestamp: Date;
  };
}

export interface ProcessedAttachment {
  type: 'DAMAGED_PARCEL' | 'RECEIPT' | 'SIGNATURE' | 'DOCUMENT' | 'VOICE_NOTE';
  textContent: string;
  embedding: number[];
  metadata: any;
}

export interface LiveMessageAnalysis {
  urgency: 'LOW' | 'HIGH';
  suggestions: Action[];
  autoReplyScore: number;
  suggestedReply?: string;
}
