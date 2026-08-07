import { EmbeddingModel } from '../../services/rag/infrastructure/EmbeddingModel';

describe('EmbeddingModel Unit Tests', () => {
  let model: EmbeddingModel;

  beforeEach(() => {
    model = new EmbeddingModel();
  });

  it('should return fallback zero vector when OpenAI is unconfigured or errors', async () => {
    const vector = await model.encodeText('Hello logistics world');
    expect(vector).toBeDefined();
    expect(Array.isArray(vector)).toBe(true);
    expect(vector.length).toBeGreaterThan(0);
  });

  it('should return batch embeddings array', async () => {
    const batch = await model.encodeBatch(['Text 1', 'Text 2']);
    expect(batch).toHaveLength(2);
    expect(batch[0]).toBeDefined();
  });

  it('should return dummy vector for image encoding', async () => {
    const vector = await model.encodeImage(Buffer.from('fake-image'));
    expect(vector).toBeDefined();
    expect(Array.isArray(vector)).toBe(true);
  });
});
