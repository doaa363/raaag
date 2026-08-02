import mongoose, { Schema, Document } from 'mongoose';

export interface IShipment extends Document {
  trackingNumber: string;
  companyId: mongoose.Types.ObjectId;
  status: 'PENDING' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELAYED' | 'CANCELLED';
  driver?: {
    id?: string;
    name?: string;
    onTimeRate?: number;
  };
  route?: {
    length?: number;
    origin?: string;
    destination?: string;
  };
  destination?: string;
  expectedDelivery?: Date;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ShipmentSchema = new Schema<IShipment>(
  {
    trackingNumber: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'CANCELLED'],
      default: 'PENDING',
    },
    driver: {
      id: String,
      name: String,
      onTimeRate: Number,
    },
    route: {
      length: Number,
      origin: String,
      destination: String,
    },
    destination: String,
    expectedDelivery: Date,
    deliveredAt: Date,
  },
  { timestamps: true }
);

export const Shipment = mongoose.model<IShipment>('Shipment', ShipmentSchema);
