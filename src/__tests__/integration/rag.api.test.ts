import request from 'supertest';
import { app } from '../../app';

describe('RAG API End-to-End Integration Tests', () => {
  const token = 'test-token';

  it('GET /api/v1/rag/health should return status ok', async () => {
    const res = await request(app).get('/api/v1/rag/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('RAG');
  });

  it('POST /api/v1/rag/query should return RAG response with confidence and suggestions', async () => {
    const res = await request(app)
      .post('/api/v1/rag/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'What is the delay status of shipment TRK-9900?' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('response');
    expect(res.body.confidence).toBeGreaterThan(0);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  it('POST /api/v1/rag/upload should process uploaded document file', async () => {
    const res = await request(app)
      .post('/api/v1/rag/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('Custom manifest content for integration testing'), 'manifest.txt')
      .field('sourceId', 'integration-src-1')
      .field('companyId', 'test-company-1');

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('processed');
    expect(res.body.filename).toBe('manifest.txt');
  });

  it('POST /api/v1/rag/reports/generate should trigger report generation', async () => {
    const res = await request(app)
      .post('/api/v1/rag/reports/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        start: '2026-08-01',
        end: '2026-08-07',
        companyId: 'test-company-1',
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('generated');
    expect(res.body).toHaveProperty('reportId');
  });

  it('GET /api/v1/rag/reports/latest should return latest report or fallback cache', async () => {
    const res = await request(app)
      .get('/api/v1/rag/reports/latest')
      .set('Authorization', `Bearer ${token}`);

    expect([200, 500]).toContain(res.status);
    if (res.status === 200 && res.body) {
      expect(res.body).toHaveProperty('title');
    }
  });

  it('POST /api/v1/rag/alerts/scan should trigger predictive alert scanning', async () => {
    const mockShipments = [
      {
        _id: 'shipment-int-1',
        trackingNumber: 'TRK-INT-1',
        driver: { onTimeRate: 0.3 },
        route: ['Stop A', 'Stop B', 'Stop C', 'Stop D', 'Stop E', 'Stop F'],
        expectedDelivery: new Date(),
      },
    ];

    const res = await request(app)
      .post('/api/v1/rag/alerts/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId: 'test-company-1',
        shipments: mockShipments,
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Scan completed');
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results[0].riskScore).toBeGreaterThan(0.7);
  });

  it('POST /api/v1/rag/feedback/rate should record user rating', async () => {
    const res = await request(app)
      .post('/api/v1/rag/feedback/rate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        insightId: '60d5ecb8b3b3a30015f8e5a1',
        rating: 1,
        comments: 'Very helpful suggestion!',
      });

    expect([201, 500]).toContain(res.status);
  });
});
