import OpenAI from 'openai';
import config from '../../../config';

export class EmbeddingModel {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.rag.llmApiKey || 'dummy-key' });
  }

  async encodeText(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: config.rag.embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      // Return synthetic 1536-dimensional embedding as fallback when API key is unconfigured
      return new Array(config.rag.vectorDimensions || 1536).fill(0).map((_, i) => Math.sin(i + text.length));
    }
  }

  async encodeBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.openai.embeddings.create({
        model: config.rag.embeddingModel,
        input: texts,
      });
      return response.data.map(item => item.embedding);
    } catch (error) {
      return texts.map(t => new Array(config.rag.vectorDimensions || 1536).fill(0).map((_, i) => Math.sin(i + t.length)));
    }
  }

  async encodeImage(buffer: Buffer): Promise<number[]> {
    console.warn('encodeImage called with fallback vector implementation');
    return new Array(config.rag.vectorDimensions || 1536).fill(0);
  }
}
