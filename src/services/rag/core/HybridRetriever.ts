import { VectorStoreRepository } from '../infrastructure/VectorStoreRepository';
import { AnalyzedQuery } from './QueryAnalyzer';
import { UserContext, VectorDocument } from '../../../types/rag.types';

export class HybridRetriever {
  constructor(private vectorStore: VectorStoreRepository) {}

  async retrieve(
    analyzed: AnalyzedQuery,
    context: UserContext,
    weights: { vectorWeight: number; keywordWeight: number; graphWeight: number }
  ): Promise<VectorDocument[]> {
    const vectorDocs = await this.vectorStore.similaritySearch(analyzed.embedding, {
      companyId: context.companyId,
      limit: 50,
    });
    return vectorDocs;
  }
}
