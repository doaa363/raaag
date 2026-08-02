import mongoose, { Schema, Document } from 'mongoose';

export interface IExecutiveReport extends Document {
  companyId: mongoose.Types.ObjectId;
  period: { start: Date; end: Date };
  title: string;
  summary: string;
  keyFindings: string[];
  charts: {
    type: string;
    data: any;
    description: string;
  }[];
  pdfUrl?: string;
}

const ExecutiveReportSchema = new Schema<IExecutiveReport>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    period: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    keyFindings: [String],
    charts: [
      {
        type: String,
        data: Schema.Types.Mixed,
        description: String,
      },
    ],
    pdfUrl: String,
  },
  { timestamps: true }
);

export const ExecutiveReport = mongoose.model<IExecutiveReport>('ExecutiveReport', ExecutiveReportSchema);
