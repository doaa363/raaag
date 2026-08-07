import { MultiModalProcessor } from '../../services/rag/processing/MultiModalProcessor';
import { EmbeddingModel } from '../../services/rag/infrastructure/EmbeddingModel';
import { VectorStoreRepository } from '../../services/rag/infrastructure/VectorStoreRepository';

describe('MultiModalProcessor Unit Tests', () => {
  let processor: MultiModalProcessor;
  let embeddingModel: EmbeddingModel;
  let vectorStore: VectorStoreRepository;

  beforeEach(() => {
    embeddingModel = new EmbeddingModel();
    vectorStore = new VectorStoreRepository();
    jest.spyOn(vectorStore, 'insert').mockResolvedValue(undefined as any);
    processor = new MultiModalProcessor(embeddingModel, vectorStore);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should process text file buffer correctly', async () => {
    const textBuffer = Buffer.from('Logistics manifest content for shipment #9988');
    const result = await processor.processBuffer(textBuffer, 'text/plain', 'manifest.txt');

    expect(result.type).toBe('DOCUMENT');
    expect(result.textContent).toBe('Logistics manifest content for shipment #9988');
    expect(result.metadata.mimeType).toBe('text/plain');
  });

  it('should return voice note placeholder when assemblyai is not configured', async () => {
    const audioBuffer = Buffer.from('fake-audio-bytes');
    const result = await processor.processBuffer(audioBuffer, 'audio/wav', 'audio.wav');

    expect(result.type).toBe('VOICE_NOTE');
    expect(result.textContent).toBe('[STT not configured]');
  });

  it('should process and index attachment into vector store', async () => {
    const insertSpy = jest.spyOn(vectorStore, 'insert').mockResolvedValue(undefined as any);
    const textBuffer = Buffer.from('SOP for handling hazardous materials');

    await processor.processAndIndex(
      textBuffer,
      'text/plain',
      'hazmat_sop.txt',
      'source-123',
      'company-456'
    );

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const insertedDoc = insertSpy.mock.calls[0][0];
    expect(insertedDoc.metadata.sourceId).toBe('source-123');
    expect(insertedDoc.metadata.companyId).toBe('company-456');
  });
});
