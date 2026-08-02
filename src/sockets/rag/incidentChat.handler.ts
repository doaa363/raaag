import { Server, Socket } from 'socket.io';
import { RAGService } from '../../services/rag/core/RAGService';
import { Message } from '../../models/Message.model';

export function setupIncidentChatSocket(io: Server, ragService: RAGService) {
  io.on('connection', (socket: Socket) => {
    socket.on('join_incident_chat', async ({ shipmentId, userId }) => {
      socket.join(`incident:${shipmentId}`);
    });

    socket.on('send_incident_message', async (data) => {
      const { shipmentId, text, senderId, senderRole, attachments, companyId } = data;

      try {
        const message = await Message.create({
          shipmentId,
          senderId,
          senderRole,
          text,
          attachments,
          timestamp: new Date(),
        });

        const shipmentContext = { companyId: companyId || 'defaultCompanyId' };

        const analysis = await ragService.analyzeLiveMessage(message, shipmentContext);

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

        if (analysis.autoReplyScore && analysis.autoReplyScore > 0.8) {
          io.to(`incident:${shipmentId}`).emit('suggested_reply', {
            messageId: message._id,
            suggestedReply: analysis.suggestedReply,
            confidence: analysis.autoReplyScore,
          });
        }
      } catch (err) {
        console.error('Error handling incident chat message:', err);
      }
    });
  });
}
