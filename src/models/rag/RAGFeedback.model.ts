import mongoose, { Schema, Document } from 'mongoose';

export interface IRAGFeedback extends Document {
  insightId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  rating: -1 | 0 | 1;
  correctedText?: string;
  comments?: string;
}

const RAGFeedbackSchema = new Schema<IRAGFeedback>(
  {
    insightId: { type: Schema.Types.ObjectId, ref: 'RAGInsight', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, enum: [-1, 0, 1], required: true },
    correctedText: String,
    comments: String,
  },
  { timestamps: true }
);

RAGFeedbackSchema.index({ insightId: 1, userId: 1 }, { unique: true });

export const RAGFeedback = mongoose.models.RAGFeedback || mongoose.model<IRAGFeedback>('RAGFeedback', RAGFeedbackSchema);
