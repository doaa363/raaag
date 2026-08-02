import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  shipmentId: mongoose.Types.ObjectId | string;
  senderId: mongoose.Types.ObjectId | string;
  senderRole: string;
  text: string;
  attachments?: string[];
  timestamp: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    shipmentId: { type: Schema.Types.Mixed, required: true, index: true },
    senderId: { type: Schema.Types.Mixed, required: true },
    senderRole: { type: String, required: true },
    text: { type: String, required: true },
    attachments: [String],
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
