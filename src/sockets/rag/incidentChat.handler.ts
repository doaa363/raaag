import { Server, Socket } from 'socket.io';
import { RAGService } from '../../services/rag/core/RAGService';
import { Message } from '../../models/Message.model';
import { LiveMessageAnalysis } from '../../types/rag.types';

export function setupIncidentChatSocket(io: Server, ragService: RAGService) {
  io.on('connection', (socket: Socket) => {
    socket.on('join_incident_chat', async ({ shipmentId, userId }) => {
      socket.join(`incident:${shipmentId}`);
    });

    socket.on('send_incident_message', async (data) => {
      const { shipmentId, text, senderId, senderRole, attachments, companyId } = data;

      try {
        let messageDoc: any = { _id: null, shipmentId, senderId, senderRole, text, attachments };
        try {
          messageDoc = await Message.create({
            shipmentId, senderId, senderRole, text, attachments, timestamp: new Date(),
          });
        } catch {
          // MongoDB offline — continue with in-memory message object
        }

        const shipmentContext = { companyId: companyId || 'defaultCompanyId' };
        const analysis: LiveMessageAnalysis = await ragService.analyzeLiveMessage(messageDoc, shipmentContext);

        socket.emit('message_received', { messageId: messageDoc._id, text, timestamp: new Date() });

        if (analysis.urgency === 'HIGH') {
          io.to(`incident:${shipmentId}`).emit('urgency_alert', {
            message: 'Urgent issue detected. Manager notified.',
            actions: analysis.suggestions,
          });
          io.to(`company:${shipmentContext.companyId}`).emit('manager_alert', {
            shipmentId,
            alert: analysis.suggestions,
          });
        }

        if (analysis.autoReplyScore > 0.8) {
          io.to(`incident:${shipmentId}`).emit('suggested_reply', {
            messageId: messageDoc._id,
            suggestedReply: analysis.suggestedReply,
            confidence: analysis.autoReplyScore,
          });
        }
      } catch (err) {
        console.error('Error handling incident chat message:', err);
        socket.emit('error', { message: 'Failed to process message' });
      }
    });
  });
}
