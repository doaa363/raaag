import mongoose, { Schema, Document } from 'mongoose';

export interface IIncident extends Document {
  companyId: mongoose.Types.ObjectId;
  shipmentId?: mongoose.Types.ObjectId;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  description: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const IncidentSchema = new Schema<IIncident>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment' },
    type: { type: String, required: true },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], default: 'OPEN' },
    description: { type: String, required: true },
    resolvedAt: Date,
  },
  { timestamps: true }
);

export const Incident = mongoose.model<IIncident>('Incident', IncidentSchema);
