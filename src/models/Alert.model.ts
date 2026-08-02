import mongoose, { Schema, Document } from 'mongoose';
import { Action } from '../types/rag.types';

export interface IAlert extends Document {
  companyId: mongoose.Types.ObjectId;
  shipmentId?: mongoose.Types.ObjectId;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  recommendedActions?: Action[];
  expiresAt?: Date;
  createdAt: Date;
}

const AlertSchema = new Schema<IAlert>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment' },
    type: { type: String, required: true },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    message: { type: String, required: true },
    recommendedActions: [Schema.Types.Mixed],
    expiresAt: Date,
  },
  { timestamps: true }
);

export const Alert = mongoose.model<IAlert>('Alert', AlertSchema);
