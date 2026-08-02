import { QdrantClient } from '@qdrant/js-client-rest';
import config from '../../../config';
import { VectorDocument } from '../../../types/rag.types';

export class VectorStoreRepository {
  private client: QdrantClient;
  private collectionName: string;
  private inMemoryDocs: Map<string, VectorDocument> = new Map();

  constructor() {
    this.client = new QdrantClient({ url: config.rag.vectorDbUrl });
    this.collectionName = config.rag.vectorIndexName;
    this.ensureCollection();
  }

  private async ensureCollection(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      if (!collections.collections.some(c => c.name === this.collectionName)) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: config.rag.vectorDimensions,
            distance: 'Cosine',
          },
        });
        console.log(`Created collection: ${this.collectionName}`);
      }
    } catch (error) {
      console.warn('Vector DB (Qdrant) unconfigured or unavailable. In-memory fallback active.');
    }
  }

  async insert(doc: VectorDocument): Promise<void> {
    this.inMemoryDocs.set(doc.id, doc);
    try {
      const point = {
        id: doc.id,
        vector: doc.embedding,
        payload: {
          content: doc.content,
          companyId: doc.metadata.companyId,
          contentType: doc.metadata.contentType,
          sourceId: doc.metadata.sourceId,
          timestamp: doc.metadata.timestamp.toISOString(),
          tags: doc.metadata.tags || [],
          damageScore: doc.metadata.damageScore,
        },
      };
      await this.client.upsert(this.collectionName, { points: [point] });
    } catch {
      // In-memory fallback updated above
    }
  }

  async similaritySearch(
    embedding: number[],
    filter: { companyId: string; contentType?: string; limit?: number; sourceId?: string }
  ): Promise<VectorDocument[]> {
    const limit = filter.limit || 10;
    try {
      const must: any[] = [
        { key: 'companyId', match: { value: filter.companyId } },
      ];
      if (filter.contentType) {
        must.push({ key: 'contentType', match: { value: filter.contentType } });
      }
      if (filter.sourceId) {
        must.push({ key: 'sourceId', match: { value: filter.sourceId } });
      }

      const response = await this.client.search(this.collectionName, {
        vector: embedding,
        limit,
        filter: { must },
        with_payload: true,
      });

      // Cast to any[] to handle varying Qdrant client response shapes
      return (response as any[]).map((point: any) => ({
        id: point.id as string,
        content: (point.payload?.content as string) || '',
        embedding: [],
        metadata: {
          companyId: point.payload?.companyId as string,
          contentType: point.payload?.contentType as string,
          sourceId: point.payload?.sourceId as string,
          timestamp: new Date(point.payload?.timestamp as string),
          tags: (point.payload?.tags as string[]) || [],
          damageScore: point.payload?.damageScore as number,
        },
        score: point.score,
      }));
    } catch {
      // Fallback search over in-memory documents
      const docs = Array.from(this.inMemoryDocs.values()).filter(
        d => d.metadata.companyId === filter.companyId
      );
      return docs.slice(0, limit);
    }
  }

  async delete(sourceId: string): Promise<void> {
    for (const [id, doc] of this.inMemoryDocs.entries()) {
      if (doc.metadata.sourceId === sourceId) {
        this.inMemoryDocs.delete(id);
      }
    }
    try {
      await this.client.delete(this.collectionName, {
        filter: {
          must: [{ key: 'sourceId', match: { value: sourceId } }],
        },
      });
    } catch {
      // Handled in-memory
    }
  }

  async reindexAll(): Promise<void> {
    this.inMemoryDocs.clear();
    try {
      await this.client.deleteCollection(this.collectionName);
      await this.ensureCollection();
    } catch {
      // Handled in-memory
    }
  }
}
