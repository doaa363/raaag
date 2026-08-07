/**
 * Day 4 – Real-time Chat Integration Test
 * Run: node test-chat.mjs
 */
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', { transports: ['websocket'] });
const SHIPMENT_ID = 'test-shipment-day4';

socket.on('connect', () => {
  console.log('[connected] socket id:', socket.id);

  socket.emit('join_incident_chat', { shipmentId: SHIPMENT_ID, userId: 'test-user' });
  console.log('[join] joined incident room for shipment:', SHIPMENT_ID);

  // Test 1: normal message (expect suggested_reply, no urgency_alert)
  setTimeout(() => {
    console.log('\n[send] normal message...');
    socket.emit('send_incident_message', {
      shipmentId: SHIPMENT_ID,
      text: 'Driver has arrived at the delivery location.',
      senderId: 'driver-001',
      senderRole: 'DRIVER',
      companyId: '60d5ecb8b3b3a30015f8e5a1',
    });
  }, 500);

  // Test 2: urgent message (expect urgency_alert)
  setTimeout(() => {
    console.log('\n[send] urgent message...');
    socket.emit('send_incident_message', {
      shipmentId: SHIPMENT_ID,
      text: 'URGENT: Package is critically damaged and customer is demanding immediate refund!',
      senderId: 'driver-001',
      senderRole: 'DRIVER',
      companyId: '60d5ecb8b3b3a30015f8e5a1',
    });
  }, 3000);

  // Disconnect after tests — wait long enough for async RAG analysis to complete
  setTimeout(() => {
    console.log('\n[done] disconnecting.');
    socket.disconnect();
    process.exit(0);
  }, 20000);
});

socket.on('room_joined', (data) => {
  console.log('[room_joined]', JSON.stringify(data));
});

socket.on('new_message', (data) => {
  console.log('\n📩 [new_message]', JSON.stringify(data, null, 2));
});

socket.on('message_received', (data) => {
  console.log('[message_received]', JSON.stringify(data, null, 2));
});

socket.on('urgency_alert', (data) => {
  console.log('\n✅ [urgency_alert] RECEIVED:', JSON.stringify(data, null, 2));
});

socket.on('suggested_reply', (data) => {
  console.log('\n✅ [suggested_reply] RECEIVED:', JSON.stringify(data, null, 2));
});

socket.on('manager_alert', (data) => {
  console.log('\n✅ [manager_alert] RECEIVED:', JSON.stringify(data, null, 2));
});

socket.on('error', (data) => {
  console.error('[error]', data);
});

socket.on('connect_error', (err) => {
  console.error('[connect_error]', err.message);
  process.exit(1);
});
