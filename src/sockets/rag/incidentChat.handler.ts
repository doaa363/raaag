import { Server, Socket } from 'socket.io';
import { RAGService } from '../../services/rag/core/RAGService';
import { Message } from '../../models/Message.model';
import { LiveMessageAnalysis } from '../../types/rag.types';

export function setupIncidentChatSocket(io: Server, ragService: RAGService) {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    socket.on('join_incident_chat', ({ shipmentId, userId }) => {
      const room = `incident:${shipmentId}`;
      socket.join(room);
      console.log(`[socket] ${userId ?? socket.id} joined room ${room}`);
      socket.emit('room_joined', { room, shipmentId });
    });

    socket.on('join_company_room', ({ companyId }) => {
      const room = `company:${companyId}`;
      socket.join(room);
      console.log(`[socket] ${socket.id} joined company room ${room}`);
      socket.emit('room_joined', { room, companyId });
    });

    socket.on('send_incident_message', async (data) => {
      const { shipmentId, text, senderId, senderRole, attachments, companyId } = data;
      console.log(`[socket] send_incident_message from ${senderId} in shipment ${shipmentId}: "${text.slice(0, 60)}"`);

      try {
        let messageDoc: any = { _id: `mem-${Date.now()}`, shipmentId, senderId, senderRole, text, attachments };
        try {
          messageDoc = await Message.create({
            shipmentId, senderId, senderRole, text, attachments, timestamp: new Date(),
          });
        } catch {
          // MongoDB offline — continue with in-memory message object
        }

        // Broadcast the message to everyone in the incident room
        io.to(`incident:${shipmentId}`).emit('new_message', {
          messageId: messageDoc._id,
          shipmentId,
          senderId,
          senderRole,
          text,
          timestamp: new Date(),
        });

        // Private ACK back to sender
        socket.emit('message_received', { messageId: messageDoc._id, text, timestamp: new Date() });

        const shipmentContext = { companyId: companyId || 'defaultCompanyId' };
        const analysis: LiveMessageAnalysis = await ragService.analyzeLiveMessage(messageDoc, shipmentContext);
        console.log(`[socket] analysis result — urgency: ${analysis.urgency}, autoReplyScore: ${analysis.autoReplyScore}`);

        if (analysis.urgency === 'HIGH') {
          console.log(`[socket] 🚨 HIGH urgency — emitting urgency_alert + manager_alert`);
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
          console.log(`[socket] 💡 high confidence — emitting suggested_reply`);
          io.to(`incident:${shipmentId}`).emit('suggested_reply', {
            messageId: messageDoc._id,
            suggestedReply: analysis.suggestedReply,
            confidence: analysis.autoReplyScore,
          });
        }
      } catch (err) {
        console.error('[socket] Error handling incident chat message:', err);
        socket.emit('error', { message: 'Failed to process message' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}
