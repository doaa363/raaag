import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { AssemblyAI } from 'assemblyai';
import * as tf from '@tensorflow/tfjs'; // tfjs-node cannot be built on Node v24/Windows without VS; use graceful fallback
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EmbeddingModel } from '../infrastructure/EmbeddingModel';
import { VectorStoreRepository } from '../infrastructure/VectorStoreRepository';
import { ProcessedAttachment, VectorDocument } from '../../../types/rag.types';
import { v4 as uuidv4 } from 'uuid';

const DAMAGE_KEYWORDS = ['damaged', 'broken', 'crushed', 'wet', 'torn'];
const DAMAGE_LABELS = ['broken', 'cracked', 'crushed', 'torn', 'wet', 'damaged', 'wreck', 'ruin'];
let mobilenetModel: mobilenet.MobileNet | null = null;
async function getMobileNet(): Promise<mobilenet.MobileNet> {
  if (!mobilenetModel) mobilenetModel = await mobilenet.load();
  return mobilenetModel;
}

export class MultiModalProcessor {
  private embeddingModel: EmbeddingModel;
  private vectorStore: VectorStoreRepository;

  constructor(embeddingModel: EmbeddingModel, vectorStore: VectorStoreRepository) {
    this.embeddingModel = embeddingModel;
    this.vectorStore = vectorStore;
  }

  async processBuffer(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
    overrideType?: ProcessedAttachment['type']
  ): Promise<ProcessedAttachment> {
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
      metadata = { mimeType };
    }

    return { type: overrideType ?? type, textContent, embedding, metadata };
  }

  private async classifyDamage(buffer: Buffer): Promise<number> {
    try {
      // tf.node.decodeImage only exists in @tensorflow/tfjs-node (native bindings).
      // On environments without native bindings (Node v24 / no Visual Studio),
      // this returns 0 and keyword scoring in processImage handles detection.
      const tfNode = (tf as any).node;
      if (!tfNode?.decodeImage) return 0;
      const model = await getMobileNet();
      const tensor = tfNode.decodeImage(buffer) as tf.Tensor3D;
      const predictions = await model.classify(tensor);
      tensor.dispose();
      return predictions
        .filter((p: { className: string; probability: number }) =>
          DAMAGE_LABELS.some(l => p.className.toLowerCase().includes(l)))
        .reduce((max: number, p: { probability: number }) => Math.max(max, p.probability), 0);
    } catch (err) {
      console.warn('classifyDamage: ML scoring unavailable, using keyword fallback', err);
      return 0;
    }
  }

  private async processImage(buffer: Buffer): Promise<{ text: string; embedding: number[]; type: ProcessedAttachment['type']; metadata: any }> {
    const ocrResult = await Tesseract.recognize(buffer, process.env.RAG_TESSERACT_LANG || 'ara+eng');
    const text = ocrResult.data.text;
    const embedding = await this.embeddingModel.encodeText(text);
    const keywordScore = DAMAGE_KEYWORDS.some(kw => text.toLowerCase().includes(kw)) ? 0.85 : 0;
    const mlScore = await this.classifyDamage(buffer);
    const damageScore = Math.max(keywordScore, mlScore);
    const type: ProcessedAttachment['type'] = damageScore > 0.5 ? 'DAMAGED_PARCEL' : 'RECEIPT';
    return { text, embedding, type, metadata: { damageScore: damageScore || 0.1, pageCount: 1 } };
  }

  private async processAudio(buffer: Buffer): Promise<{ text: string; embedding: number[]; metadata: any }> {
    const apiKey = process.env.RAG_ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      const transcript = '[STT not configured]';
      const embedding = await this.embeddingModel.encodeText(transcript);
      return { text: transcript, embedding, metadata: { duration: 0 } };
    }
    // Write buffer to a temp file so AssemblyAI SDK can upload it
    const tmpPath = path.join(os.tmpdir(), `audio-${uuidv4()}.tmp`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      const client = new AssemblyAI({ apiKey });
      const result = await client.transcripts.transcribe({ audio: tmpPath });
      const transcript = result.text ?? '';
      const embedding = await this.embeddingModel.encodeText(transcript);
      return { text: transcript, embedding, metadata: { duration: result.audio_duration ?? 0 } };
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
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
    companyId: string,
    overrideType?: ProcessedAttachment['type']
  ): Promise<ProcessedAttachment> {
    const processed = await this.processBuffer(buffer, mimeType, originalName, overrideType);
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
    return processed;
  }
}
