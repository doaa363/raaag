import { EmbeddingModel } from '../infrastructure/EmbeddingModel';
import { VectorStoreRepository } from '../infrastructure/VectorStoreRepository';
import { CacheManager } from '../infrastructure/CacheManager';
import { QueryAnalyzer } from './QueryAnalyzer';
import { HybridRetriever } from './HybridRetriever';
import { CrossEncoderReranker } from './CrossEncoderReranker';
import { LLMResponseGenerator } from './LLMResponseGenerator';
import { RAGResponse, UserContext, Action, VectorDocument, LiveMessageAnalysis } from '../../../types/rag.types';
import { RAGInsight } from '../../../models/rag/RAGInsight.model';

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
    // 1. Check cache
    const cacheKey = await this.cache.computeKey(rawQuery, userContext);
    if (options.useCache !== false) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached as RAGResponse;
    }

    // 2. Analyze query
    const analyzed = await this.queryAnalyzer.analyze(rawQuery, userContext);
    const embedding = await this.embeddingModel.encodeText(rawQuery);
    analyzed.embedding = embedding;

    // 3. Hybrid retrieval
    const rawDocs = await this.retriever.retrieve(analyzed, userContext, {
      vectorWeight: 0.6,
      keywordWeight: 0.3,
      graphWeight: 0.1,
    });

    // 4. Rerank
    const rerankedDocs = await this.reranker.rerank(rawQuery, rawDocs, { topK: 10 });

    // 5. Generate response
    const generated = await this.llmGenerator.generate(rawQuery, analyzed, rerankedDocs, userContext);

    // 6. Build final response
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

    // 7. Store provenance
    await this.storeProvenance(userContext, rawQuery, response, rerankedDocs);

    // 8. Cache
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
    return actions;
  }

  private async storeProvenance(
    context: UserContext,
    query: string,
    response: RAGResponse,
    docs: VectorDocument[]
  ): Promise<void> {
    try {
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
          retrievedDocs: response.provenance.retrievedDocIds,
          prompt: response.provenance.prompt,
          model: response.provenance.model,
          timestamp: response.provenance.timestamp,
        },
      });
      await insight.save();
    } catch {
      // MongoDB may be offline; provenance is non-critical
    }
  }

  async analyzeLiveMessage(message: any, shipmentContext: any): Promise<LiveMessageAnalysis> {
    const analyzed = await this.queryAnalyzer.analyze(message.text, {
      userId: message.senderId,
      companyId: shipmentContext.companyId,
      role: message.senderRole,
    });
    const fullResponse = await this.query(message.text, {
      userId: message.senderId,
      companyId: shipmentContext.companyId,
      role: message.senderRole,
      shipmentId: message.shipmentId,
    });
    const urgency: 'LOW' | 'HIGH' =
      analyzed.entities.urgency === 'HIGH' || analyzed.entities.urgency === 'CRITICAL' ? 'HIGH' : 'LOW';
    return {
      urgency,
      suggestions: fullResponse.suggestions,
      autoReplyScore: fullResponse.confidence > 0.7 ? 0.9 : 0.3,
      suggestedReply: fullResponse.confidence > 0.7 ? fullResponse.response : undefined,
    };
  }
}
