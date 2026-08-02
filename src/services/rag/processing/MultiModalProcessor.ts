import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { EmbeddingModel } from '../infrastructure/EmbeddingModel';
import { VectorStoreRepository } from '../infrastructure/VectorStoreRepository';
import { ProcessedAttachment, VectorDocument } from '../../../types/rag.types';
import { v4 as uuidv4 } from 'uuid';

const DAMAGE_KEYWORDS = ['damaged', 'broken', 'crushed', 'wet', 'torn'];

export class MultiModalProcessor {
  private embeddingModel: EmbeddingModel;
  private vectorStore: VectorStoreRepository;

  constructor(embeddingModel: EmbeddingModel, vectorStore: VectorStoreRepository) {
    this.embeddingModel = embeddingModel;
    this.vectorStore = vectorStore;
  }

  async processBuffer(buffer: Buffer, mimeType: string, originalName: string): Promise<ProcessedAttachment> {
    let textContent = '';
    let embedding: number[] = [];
    let type: ProcessedAttachment['type'] = 'DOCUMENT';
    let metadata: any = {};

    if (mimeType.startsWith('image/')) {
      const result = await this.processImage(buffer);
      textContent = result.text;
      embedding = result.embedding;
      type = result.type;
      metadata = result.metadata;
    } else if (mimeType.startsWith('audio/')) {
      const result = await this.processAudio(buffer);
      textContent = result.text;
      embedding = result.embedding;
      type = 'VOICE_NOTE';
      metadata = result.metadata;
    } else if (mimeType === 'application/pdf') {
      const result = await this.processPDF(buffer);
      textContent = result.text;
      embedding = result.embedding;
      type = 'DOCUMENT';
      metadata = result.metadata;
    } else {
      textContent = buffer.toString('utf-8').slice(0, 500);
      embedding = await this.embeddingModel.encodeText(textContent);
    }

    return { type, textContent, embedding, metadata };
  }

  private async processImage(buffer: Buffer): Promise<{ text: string; embedding: number[]; type: ProcessedAttachment['type']; metadata: any }> {
    const ocrResult = await Tesseract.recognize(buffer, process.env.RAG_TESSERACT_LANG || 'ara+eng');
    const text = ocrResult.data.text;
    const embedding = await this.embeddingModel.encodeText(text);
    const damageScore = DAMAGE_KEYWORDS.some(kw => text.toLowerCase().includes(kw)) ? 0.85 : 0.1;
    const type: ProcessedAttachment['type'] = damageScore > 0.5 ? 'DAMAGED_PARCEL' : 'RECEIPT';
    return { text, embedding, type, metadata: { damageScore, pageCount: 1 } };
  }

  private async processAudio(buffer: Buffer): Promise<{ text: string; embedding: number[]; metadata: any }> {
    // STT via AssemblyAI would be wired here; placeholder for now
    const transcript = process.env.RAG_ASSEMBLYAI_API_KEY
      ? '[Audio transcription placeholder]'
      : '[STT not configured]';
    const embedding = await this.embeddingModel.encodeText(transcript);
    return { text: transcript, embedding, metadata: { duration: 0 } };
  }

  private async processPDF(buffer: Buffer): Promise<{ text: string; embedding: number[]; metadata: any }> {
    const data = await pdfParse(buffer);
    const text = data.text;
    const embedding = await this.embeddingModel.encodeText(text);
    return { text, embedding, metadata: { pageCount: data.numpages } };
  }

  async processAndIndex(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
    sourceId: string,
    companyId: string
  ): Promise<void> {
    const processed = await this.processBuffer(buffer, mimeType, originalName);
    const doc: VectorDocument = {
      id: uuidv4(),
      content: processed.textContent,
      embedding: processed.embedding,
      metadata: {
        companyId,
        contentType: 'ATTACHMENT',
        sourceId,
        timestamp: new Date(),
        tags: [processed.type],
        damageScore: processed.metadata?.damageScore,
        fileType: mimeType,
      },
    };
    await this.vectorStore.insert(doc);
  }
}
