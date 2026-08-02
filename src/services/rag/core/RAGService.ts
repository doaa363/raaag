import { EmbeddingModel } from '../infrastructure/EmbeddingModel';
import { VectorStoreRepository } from '../infrastructure/VectorStoreRepository';
import { CacheManager } from '../infrastructure/CacheManager';
import { QueryAnalyzer } from './QueryAnalyzer';
import { HybridRetriever } from './HybridRetriever';
import { CrossEncoderReranker } from './CrossEncoderReranker';
import { LLMResponseGenerator } from './LLMResponseGenerator';
import { RAGResponse, UserContext, Action } from '../../../types/rag.types';
import { RAGInsight } from '../../../models/rag/RAGInsight.model';
import mongoose from 'mongoose';

export class RAGService {
  constructor(
    private embeddingModel: EmbeddingModel,
    private vectorStore: VectorStoreRepository,
    private cache: CacheManager,
    private queryAnalyzer: QueryAnalyzer,
    private retriever: HybridRetriever,
    private reranker: CrossEncoderReranker,
    private llmGenerator: LLMResponseGenerator
  ) {}

  async query(
    rawQuery: string,
    userContext: UserContext,
    options: { useCache?: boolean; temperature?: number } = {}
  ): Promise<RAGResponse> {
    const cacheKey = await this.cache.computeKey(rawQuery, userContext);
    if (options.useCache !== false) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached as RAGResponse;
    }

    const analyzed = await this.queryAnalyzer.analyze(rawQuery, userContext);
    const embedding = await this.embeddingModel.encodeText(rawQuery);
    analyzed.embedding = embedding;

    const rawDocs = await this.retriever.retrieve(analyzed, userContext, {
      vectorWeight: 0.6,
      keywordWeight: 0.3,
      graphWeight: 0.1,
    });

    const rerankedDocs = await this.reranker.rerank(rawQuery, rawDocs, { topK: 10 });
    const generated = await this.llmGenerator.generate(rawQuery, analyzed, rerankedDocs, userContext);

    const response: RAGResponse = {
      response: generated.text,
      confidence: generated.confidence,
      suggestions: this.extractActions(generated.text),
      provenance: {
        retrievedDocIds: rerankedDocs.map(d => d.id),
        prompt: generated.promptUsed,
        model: generated.model,
        timestamp: new Date(),
      },
    };

    await this.storeProvenance(userContext, rawQuery, response, rerankedDocs);
    await this.cache.set(cacheKey, response, { ttl: 300 });

    return response;
  }

  private extractActions(text: string): Action[] {
    const lines = text.split('\n');
    const actions: Action[] = [];
    for (const line of lines) {
      if (line.trim().match(/^[0-9*\-•]\s*/)) {
        actions.push({
          type: 'CONTACT_DRIVER',
          description: line.trim().replace(/^[0-9*\-•]\s*/, ''),
          assignedTo: 'DRIVER',
          priority: 3,
          steps: [line.trim()],
        });
      }
    }
    if (actions.length === 0) {
      actions.push({
        type: 'CONTACT_DRIVER',
        description: 'Verify shipment status with driver',
        assignedTo: 'DISPATCHER',
        priority: 2,
      });
    }
    return actions;
  }

  private async storeProvenance(
    context: UserContext,
    query: string,
    response: RAGResponse,
    docs: any[]
  ): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        const insight = new RAGInsight({
          insightType: 'RECOMMENDATION',
          generatedFor: {
            userId: context.userId,
            companyId: context.companyId,
            shipmentId: context.shipmentId,
            incidentId: context.incidentId,
          },
          content: response.response,
          structuredActions: response.suggestions,
          confidence: response.confidence,
          provenance: {
            retrievedDocs: [],
            prompt: response.provenance.prompt,
            model: response.provenance.model,
            timestamp: response.provenance.timestamp,
          },
        });
        await insight.save();
      }
    } catch (e) {
      // Ignore DB errors during fallback/standalone execution
    }
  }

  async analyzeLiveMessage(message: any, shipmentContext: any): Promise<Partial<RAGResponse> & { urgency?: string; autoReplyScore?: number; suggestedReply?: string }> {
    const fullResponse = await this.query(message.text, {
      userId: message.senderId,
      companyId: shipmentContext.companyId,
      role: message.senderRole,
      shipmentId: message.shipmentId,
    });
    const urgency = fullResponse.response.includes('urgent') ? 'HIGH' : 'LOW';
    return {
      urgency,
      suggestions: fullResponse.suggestions,
      autoReplyScore: fullResponse.confidence > 0.8 ? 0.9 : 0.3,
      suggestedReply: fullResponse.confidence > 0.8 ? fullResponse.response : undefined,
    };
  }
}
