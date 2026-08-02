import mongoose, { Schema, Document } from 'mongoose';

export interface IRAGEmbedding extends Document {
  content: string;
  contentType: 'INCIDENT_CHAT' | 'DRIVER_REPORT' | 'RESOLUTION_NOTE' | 'SOP' | 'FEEDBACK_COMMENT' | 'ATTACHMENT';
  sourceId: string;
  companyId: mongoose.Types.ObjectId;
  departmentId?: mongoose.Types.ObjectId;
  embedding: number[];
  metadata: {
    language: 'ar' | 'en';
    timestamp: Date;
    senderRole?: string;
    tags?: string[];
    damageScore?: number;
    fileType?: string;
  };
  version: number;
}

const RAGEmbeddingSchema = new Schema<IRAGEmbedding>(
  {
    content: { type: String, required: true },
    contentType: {
      type: String,
      enum: ['INCIDENT_CHAT', 'DRIVER_REPORT', 'RESOLUTION_NOTE', 'SOP', 'FEEDBACK_COMMENT', 'ATTACHMENT'],
      required: true,
    },
    sourceId: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    embedding: { type: [Number], required: true },
    metadata: {
      language: { type: String, enum: ['ar', 'en'], default: 'en' },
      timestamp: { type: Date, default: Date.now },
      senderRole: String,
      tags: [String],
      damageScore: Number,
      fileType: String,
    },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

RAGEmbeddingSchema.index({ companyId: 1, contentType: 1, sourceId: 1 });

export const RAGEmbedding = mongoose.model<IRAGEmbedding>('RAGEmbedding', RAGEmbeddingSchema);
