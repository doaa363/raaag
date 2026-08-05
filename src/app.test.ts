import { QueryAnalyzer } from './services/rag/core/QueryAnalyzer';
import { CrossEncoderReranker } from './services/rag/core/CrossEncoderReranker';
import { TimeSeriesModel } from './services/rag/predictive/TimeSeriesModel';
import { MultiModalProcessor } from './services/rag/processing/MultiModalProcessor';
import { EmbeddingModel } from './services/rag/infrastructure/EmbeddingModel';
import { VectorStoreRepository } from './services/rag/infrastructure/VectorStoreRepository';
import request from 'supertest';
import { app } from './app';

describe('LogiCore RAG System Unit Tests', () => {
  test('QueryAnalyzer detects language and intent correctly', async () => {
    const analyzer = new QueryAnalyzer();
    const result = await analyzer.analyze('Urgent problem with shipment delivery', {
      userId: 'test-user',
      companyId: 'test-company',
      role: 'DISPATCHER',
    });

    expect(result.language).toBe('en');
    expect(result.intent).toBe('COMPLAINT');
    expect(result.entities.urgency).toBe('HIGH');
  });

  test('QueryAnalyzer detects Arabic language', async () => {
    const analyzer = new QueryAnalyzer();
    const result = await analyzer.analyze('تأخير في تسليم الشحنة', {
      userId: 'test-user',
      companyId: 'test-company',
      role: 'DISPATCHER',
    });

    expect(result.language).toBe('ar');
  });

  test('CrossEncoderReranker sorts documents by score', async () => {
    const reranker = new CrossEncoderReranker();
    const docs = [
      { id: '1', content: 'Short', embedding: [], metadata: { companyId: 'c1', contentType: 'SOP', sourceId: 's1', timestamp: new Date() }, score: 0.2 },
      { id: '2', content: 'Long document text content for logistics', embedding: [], metadata: { companyId: 'c1', contentType: 'SOP', sourceId: 's2', timestamp: new Date() }, score: 0.9 },
    ];

    const reranked = await reranker.rerank('test query', docs, { topK: 2 });
    expect(reranked[0].id).toBe('2');
  });

  test('TimeSeriesModel computes delay risk score', async () => {
    const model = new TimeSeriesModel();
    const risk = await model.predict([0.8, 0.9, 0.2, 0.5, 0.3, 0.4]);
    expect(risk).toBeGreaterThan(0);
    expect(risk).toBeLessThanOrEqual(1);
  });
});

describe('MultiModalProcessor', () => {
  let processor: MultiModalProcessor;

  beforeEach(() => {
    const embeddingModel = new EmbeddingModel();
    const vectorStore = new VectorStoreRepository();
    // Stub insert so tests don't need Qdrant running
    jest.spyOn(vectorStore, 'insert').mockResolvedValue(undefined as any);
    processor = new MultiModalProcessor(embeddingModel, vectorStore);
  });

  afterEach(() => jest.restoreAllMocks());

  test('PDF extraction returns DOCUMENT type with pageCount', async () => {
    const pdfParse = require('pdf-parse');
    jest.spyOn(pdfParse, 'default' in pdfParse ? 'default' : 'call').mockResolvedValue(undefined);
    // Mock the module-level import used inside MultiModalProcessor
    jest.mock('pdf-parse', () => jest.fn().mockResolvedValue({ text: 'Shipment manifest content', numpages: 3 }));
    // Re-require processor with mocked pdf-parse
    jest.resetModules();
    const pdfParseMock = jest.fn().mockResolvedValue({ text: 'Shipment manifest content', numpages: 3 });
    jest.doMock('pdf-parse', () => pdfParseMock);
    const { MultiModalProcessor: MMP } = await import('./services/rag/processing/MultiModalProcessor');
    const { EmbeddingModel: EM } = await import('./services/rag/infrastructure/EmbeddingModel');
    const { VectorStoreRepository: VSR } = await import('./services/rag/infrastructure/VectorStoreRepository');
    const em = new EM();
    const vs = new VSR();
    jest.spyOn(vs, 'insert').mockResolvedValue(undefined as any);
    const proc = new MMP(em, vs);
    const result = await proc.processBuffer(Buffer.from('fake-pdf'), 'application/pdf', 'manifest.pdf');
    expect(result.type).toBe('DOCUMENT');
    expect(result.metadata.pageCount).toBe(3);
    jest.resetModules();
  });

  test('audio without API key returns STT-not-configured placeholder', async () => {
    const original = process.env.RAG_ASSEMBLYAI_API_KEY;
    delete process.env.RAG_ASSEMBLYAI_API_KEY;
    const result = await processor.processBuffer(Buffer.from('fake-audio'), 'audio/mpeg', 'note.mp3');
    expect(result.type).toBe('VOICE_NOTE');
    expect(result.textContent).toBe('[STT not configured]');
    process.env.RAG_ASSEMBLYAI_API_KEY = original;
  });

  test('processAndIndex calls vectorStore.insert with correct metadata', async () => {
    jest.resetModules();
    const pdfParseMock = jest.fn().mockResolvedValue({ text: 'manifest text', numpages: 2 });
    jest.doMock('pdf-parse', () => pdfParseMock);
    const { MultiModalProcessor: MMP } = await import('./services/rag/processing/MultiModalProcessor');
    const { EmbeddingModel: EM } = await import('./services/rag/infrastructure/EmbeddingModel');
    const { VectorStoreRepository: VSR } = await import('./services/rag/infrastructure/VectorStoreRepository');
    const em = new EM();
    const vs = new VSR();
    const insertSpy = jest.spyOn(vs, 'insert').mockResolvedValue(undefined as any);
    const proc = new MMP(em, vs);
    await proc.processAndIndex(Buffer.from('fake-pdf'), 'application/pdf', 'manifest.pdf', 'test-pdf-1', 'test-company');
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const doc = insertSpy.mock.calls[0][0];
    expect(doc.metadata.sourceId).toBe('test-pdf-1');
    expect(doc.metadata.companyId).toBe('test-company');
    expect(doc.metadata.contentType).toBe('ATTACHMENT');
    jest.resetModules();
  });

  test('image with damage keywords returns DAMAGED_PARCEL type', async () => {
    jest.resetModules();
    jest.doMock('tesseract.js', () => ({ recognize: jest.fn().mockResolvedValue({ data: { text: 'Package is damaged and crushed' } }) }));
    jest.doMock('@tensorflow-models/mobilenet', () => ({ load: jest.fn().mockResolvedValue({ classify: jest.fn().mockResolvedValue([]) }) }));
    const { MultiModalProcessor: MMP } = await import('./services/rag/processing/MultiModalProcessor');
    const { EmbeddingModel: EM } = await import('./services/rag/infrastructure/EmbeddingModel');
    const { VectorStoreRepository: VSR } = await import('./services/rag/infrastructure/VectorStoreRepository');
    const vs = new VSR(); jest.spyOn(vs, 'insert').mockResolvedValue(undefined as any);
    const result = await new MMP(new EM(), vs).processBuffer(Buffer.from('fake-image'), 'image/jpeg', 'box.jpg');
    expect(result.type).toBe('DAMAGED_PARCEL');
    expect(result.metadata.damageScore).toBeGreaterThan(0.5);
    jest.resetModules();
  }, 15000);

  test('image without damage keywords returns RECEIPT type', async () => {
    jest.resetModules();
    jest.doMock('tesseract.js', () => ({ recognize: jest.fn().mockResolvedValue({ data: { text: 'Total: $45.20\nDate: 2024-01-15' } }) }));
    jest.doMock('@tensorflow-models/mobilenet', () => ({ load: jest.fn().mockResolvedValue({ classify: jest.fn().mockResolvedValue([]) }) }));
    const { MultiModalProcessor: MMP } = await import('./services/rag/processing/MultiModalProcessor');
    const { EmbeddingModel: EM } = await import('./services/rag/infrastructure/EmbeddingModel');
    const { VectorStoreRepository: VSR } = await import('./services/rag/infrastructure/VectorStoreRepository');
    const vs = new VSR(); jest.spyOn(vs, 'insert').mockResolvedValue(undefined as any);
    const result = await new MMP(new EM(), vs).processBuffer(Buffer.from('fake-image'), 'image/jpeg', 'receipt.jpg');
    expect(result.type).toBe('RECEIPT');
    expect(result.metadata.damageScore).toBe(0.1);
    expect(result.textContent).toContain('$45.20');
    jest.resetModules();
  }, 15000);

  test('overrideType SIGNATURE is respected regardless of OCR content', async () => {
    jest.resetModules();
    jest.doMock('tesseract.js', () => ({ recognize: jest.fn().mockResolvedValue({ data: { text: 'some text' } }) }));
    jest.doMock('@tensorflow-models/mobilenet', () => ({ load: jest.fn().mockResolvedValue({ classify: jest.fn().mockResolvedValue([]) }) }));
    const { MultiModalProcessor: MMP } = await import('./services/rag/processing/MultiModalProcessor');
    const { EmbeddingModel: EM } = await import('./services/rag/infrastructure/EmbeddingModel');
    const { VectorStoreRepository: VSR } = await import('./services/rag/infrastructure/VectorStoreRepository');
    const vs = new VSR(); jest.spyOn(vs, 'insert').mockResolvedValue(undefined as any);
    const result = await new MMP(new EM(), vs).processBuffer(Buffer.from('fake-image'), 'image/jpeg', 'sig.jpg', 'SIGNATURE');
    expect(result.type).toBe('SIGNATURE');
    jest.resetModules();
  }, 15000);
});

describe('Upload route file validation', () => {
  test('rejects disallowed MIME type with 400', async () => {
    const res = await request(app)
      .post('/api/v1/rag/upload')
      .attach('file', Buffer.from('#!/bin/bash'), { filename: 'evil.sh', contentType: 'application/x-sh' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported file type/);
  });
});
