import mongoose, { Schema, Document } from 'mongoose';
import { InsightType, Action } from '../../types/rag.types';

export interface IRAGInsight extends Document {
  insightType: InsightType;
  generatedFor: {
    userId: mongoose.Types.ObjectId;
    companyId: mongoose.Types.ObjectId;
    shipmentId?: mongoose.Types.ObjectId;
    incidentId?: mongoose.Types.ObjectId;
  };
  content: string;
  structuredActions?: Action[];
  confidence: number;
  provenance: {
    retrievedDocs: mongoose.Types.ObjectId[];
    prompt: string;
    model: string;
    timestamp: Date;
  };
  userRating?: 'HELPFUL' | 'SOMEWHAT' | 'UNHELPFUL';
  appliedOutcome?: {
    resolved: boolean;
    resolutionTime: number;
  };
}

const RAGInsightSchema = new Schema<IRAGInsight>(
  {
    insightType: {
      type: String,
      enum: ['RECOMMENDATION', 'PREDICTIVE_ALERT', 'EXECUTIVE_SUMMARY', 'ESCALATION_BRIEF'],
      required: true,
    },
    generatedFor: {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
      shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment' },
      incidentId: { type: Schema.Types.ObjectId, ref: 'Incident' },
    },
    content: { type: String, required: true },
    structuredActions: [
      {
        type: { type: String, enum: ['APPROVE', 'DELEGATE', 'REFUND', 'REPLACE', 'ESCALATE', 'CONTACT_DRIVER', 'CONTACT_CUSTOMER'] },
        description: String,
        assignedTo: String,
        priority: { type: Number, min: 1, max: 5 },
        steps: [String],
        expectedOutcome: String,
      },
    ],
    confidence: { type: Number, min: 0, max: 1, required: true },
    provenance: {
      retrievedDocs: [{ type: Schema.Types.ObjectId, ref: 'RAGEmbedding' }],
      prompt: String,
      model: String,
      timestamp: { type: Date, default: Date.now },
    },
    userRating: { type: String, enum: ['HELPFUL', 'SOMEWHAT', 'UNHELPFUL'] },
    appliedOutcome: {
      resolved: Boolean,
      resolutionTime: Number,
    },
  },
  { timestamps: true }
);

RAGInsightSchema.index({ 'generatedFor.companyId': 1, insightType: 1 });
RAGInsightSchema.index({ 'generatedFor.userId': 1 });

export const RAGInsight = mongoose.models.RAGInsight || mongoose.model<IRAGInsight>('RAGInsight', RAGInsightSchema);
