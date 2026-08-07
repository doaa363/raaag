/**
 * Day 5 – Predictive Alert Engine Test
 * ─────────────────────────────────────
 * Tests the full pipeline:
 *   Socket → join company room → HTTP POST /alerts/scan (with mock shipments)
 *   → listen for predictive_alert events → verify results
 *
 * No MongoDB / build step required. Run: node test-alert.mjs
 */
import { io } from 'socket.io-client';

const BASE_URL  = 'http://localhost:3000';
const COMPANY_ID = 'test-company-alert-day5';

// ── Two mock shipments: one high-risk, one safe ──────────────────────────────
const mockShipments = [
  {
    _id:             'mock-ship-001',
    trackingNumber:  'ALERT-HIGH-001',
    companyId:       COMPANY_ID,
    status:          'OUT_FOR_DELIVERY',
    expectedDelivery: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    driver:  { onTimeRate: 0.10 },  // very poor driver history → ↑↑ risk
    route:   { length: 10 },        // long/complex route (capped at 1.0 after /5) → max risk
    destination: 'Zone 7',
  },
  {
    _id:             'mock-ship-002',
    trackingNumber:  'ALERT-LOW-002',
    companyId:       COMPANY_ID,
    status:          'OUT_FOR_DELIVERY',
    expectedDelivery: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    driver:  { onTimeRate: 0.98 },  // excellent history   → ↓↓ risk
    route:   { length: 1 },         // minimal route       → ↓ risk
    destination: 'Zone 1',
  },
];

// ── 1. Socket: connect + join company room ───────────────────────────────────
const socket = io(BASE_URL, { transports: ['websocket'] });
let alertsReceived = 0;

socket.on('connect', () => {
  console.log('[socket] connected:', socket.id);
  socket.emit('join_company_room', { companyId: COMPANY_ID });
});

socket.on('room_joined', (data) => {
  console.log('[socket] room_joined:', JSON.stringify(data));
});

socket.on('predictive_alert', (data) => {
  alertsReceived++;
  console.log(`\n🚨 [predictive_alert] #${alertsReceived} RECEIVED:`);
  console.log(`   tracking:  ${data.trackingNumber ?? data.shipmentId}`);
  console.log(`   riskScore: ${(data.riskScore * 100).toFixed(1)}%`);
  console.log(`   severity:  ${data.severity}`);
  console.log(`   actions:   ${data.actions?.length ?? 0} suggested`);
  if (data.actions?.length) {
    data.actions.forEach((a, i) => console.log(`     ${i + 1}. ${a.description}`));
  }
});

socket.on('connect_error', (err) => {
  console.error('[socket] connect_error:', err.message);
  process.exit(1);
});

// ── 2. HTTP: trigger scan with mock shipments ────────────────────────────────
async function triggerScan() {
  console.log('\n[http] POST /api/v1/rag/alerts/scan ...');
  const res = await fetch(`${BASE_URL}/api/v1/rag/alerts/scan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ companyId: COMPANY_ID, shipments: mockShipments }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[http] ❌ scan failed:', res.status, text);
    process.exit(1);
  }

  const json = await res.json();
  console.log('\n[http] ✅ Scan response:');
  console.log(`   companyId: ${json.companyId}`);
  json.results?.forEach((r, i) => {
    console.log(`   [${i + 1}] riskScore=${(r.riskScore * 100).toFixed(1)}%  saved=${r.saved}  alertId=${r.alertId ?? 'n/a (MongoDB offline)'}`);
  });

  return json.results;
}

// ── 3. Wait for socket to join, then scan, then verify ──────────────────────
setTimeout(async () => {
  try {
    const results = await triggerScan();

    const highRisk = results?.filter(r => r.riskScore > 0.7) ?? [];
    const lowRisk  = results?.filter(r => r.riskScore <= 0.7) ?? [];

    console.log(`\n[verify] High-risk shipments flagged : ${highRisk.length}`);
    console.log(`[verify] Low-risk shipments skipped  : ${lowRisk.length}`);

    // Wait for socket events to arrive, then summarise
    setTimeout(() => {
      console.log(`\n[verify] predictive_alert socket events received: ${alertsReceived}`);

      const allPass =
        highRisk.length >= 1 &&
        lowRisk.length  >= 1 &&
        alertsReceived  >= 1;

      if (allPass) {
        console.log('\n✅ Day 5 SUCCESS — predictive alert engine working end-to-end!');
      } else {
        console.warn('\n⚠️  Some criteria not met — check server logs above.');
      }

      socket.disconnect();
      process.exit(0);
    }, 12000); // wait up to 12s for async RAG + socket events
  } catch (err) {
    console.error('[test] Unexpected error:', err);
    process.exit(1);
  }
}, 1000); // give socket 1s to join the room first
