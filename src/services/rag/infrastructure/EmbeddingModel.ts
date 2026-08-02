import OpenAI from 'openai';
import config from '../../../config';

export class EmbeddingModel {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.rag.llmApiKey });
  }

  async encodeText(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: config.rag.embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    } catch {
      // Return zero vector as fallback if OpenAI is unavailable
      return new Array(config.rag.vectorDimensions).fill(0);
    }
  }

  async encodeBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.openai.embeddings.create({
        model: config.rag.embeddingModel,
        input: texts,
      });
      return response.data.map(item => item.embedding);
    } catch {
      return texts.map(() => new Array(config.rag.vectorDimensions).fill(0));
    }
  }

  async encodeImage(buffer: Buffer): Promise<number[]> {
    console.warn('encodeImage called with dummy implementation');
    return new Array(config.rag.vectorDimensions).fill(0);
  }
}
