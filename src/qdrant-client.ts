import "dotenv/config";

import { QdrantClient as QdrantApi } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { createHash } from "crypto";
import { ProcessedDocument, DocumentChunk, DocumentProcessor } from "./document-processor.js";

export class QdrantClient {
  private client: QdrantApi;
  private collectionName: string | null = null;
  private openai: OpenAI;
  private embeddingModel: string = "text-embedding-3-small";

  constructor() {
    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";

    this.client = new QdrantApi({
      url: qdrantUrl,
      apiKey: process.env.QDRANT_API_KEY,
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });
  }

  async initialize(collectionName: string = "context1000", docsPath?: string): Promise<void> {
    this.collectionName = collectionName;

    try {
      // Check if collection exists
      await this.client.getCollection(collectionName);
      console.log(`Connected to existing collection: ${collectionName}`);
    } catch (error) {
      // Collection doesn't exist, create it
      await this.client.createCollection(collectionName, {
        vectors: {
          size: 1536, // text-embedding-3-small dimension
          distance: "Cosine",
        },
      });
      console.log(`Created new collection: ${collectionName}`);

      if (docsPath) {
        console.log(`Processing documents from: ${docsPath}`);
        const processor = new DocumentProcessor();
        const chunks = await processor.processDocumentsToChunks(docsPath);
        if (chunks.length > 0) {
          await this.addDocuments(chunks);
          console.log(`Processed and added ${chunks.length} document chunks from ${docsPath}`);
        }
      }
    }
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });

    return response.data.map((item) => item.embedding);
  }

  private stringToUuid(str: string): string {
    // Generate a deterministic UUID from a string using MD5 hash
    const hash = createHash('md5').update(str).digest('hex');
    // Format as UUID v4 (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16),
      ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20),
      hash.substring(20, 32),
    ].join('-');
  }

  async addDocuments(items: ProcessedDocument[] | DocumentChunk[]): Promise<void> {
    if (!this.collectionName) {
      throw new Error("Collection not initialized");
    }

    const texts = items.map((item) => item.content);
    const embeddings = await this.generateEmbeddings(texts);

    const points = items.map((item, index) => {
      const basePayload = {
        documentId: item.id, // Store original ID for reference
        title: item.metadata.title,
        type: item.metadata.type,
        tags: item.metadata.tags,
        projects: item.metadata.projects,
        status: item.metadata.status || "",
        filePath: item.metadata.filePath,
        related: item.metadata.related || {},
        content: item.content,
      };

      const payload = "chunkIndex" in item.metadata
        ? {
            ...basePayload,
            chunkIndex: item.metadata.chunkIndex,
            totalChunks: item.metadata.totalChunks,
            sectionType: item.metadata.sectionType || "",
            sectionTitle: item.metadata.sectionTitle || "",
            tokens: item.metadata.tokens,
          }
        : basePayload;

      return {
        id: this.stringToUuid(item.id), // Convert string ID to UUID
        vector: embeddings[index],
        payload,
      };
    });

    await this.client.upsert(this.collectionName, {
      wait: true,
      points,
    });

    console.log(`Added ${items.length} items to collection`);
  }

  async queryDocuments(
    query: string,
    nResults: number = 5,
    filters?: Record<string, any>
  ): Promise<{
    documents: string[];
    metadatas: Record<string, any>[];
    distances: number[];
  }> {
    if (!this.collectionName) {
      throw new Error("Collection not initialized");
    }

    // Generate embedding for query
    const queryEmbeddings = await this.generateEmbeddings([query]);
    const queryVector = queryEmbeddings[0];

    // Build query parameters
    const queryParams: any = {
      vector: queryVector,
      limit: nResults,
      with_payload: true,
    };

    // Add filters if provided
    if (filters) {
      queryParams.filter = this.convertFiltersToQdrant(filters);
    }

    const results = await this.client.search(this.collectionName, queryParams);

    return {
      documents: results.map((result) => result.payload?.content as string || ""),
      metadatas: results.map((result) => {
        const { content, ...metadata } = result.payload as any;
        return metadata;
      }),
      distances: results.map((result) => 1 - result.score), // Convert similarity to distance
    };
  }

  private convertFiltersToQdrant(filters: Record<string, any>): any {
    // Convert ChromaDB-style filters to Qdrant format
    if (!filters) return undefined;

    // Handle $or conditions
    if (filters.$or && Array.isArray(filters.$or)) {
      const should = filters.$or.map((condition: any) => {
        return this.convertSingleCondition(condition);
      }).flat();
      return { should };
    }

    // Handle single condition or multiple must conditions
    const must = this.convertSingleCondition(filters);
    return { must };
  }

  private convertSingleCondition(condition: Record<string, any>): any[] {
    const conditions: any[] = [];

    for (const [key, value] of Object.entries(condition)) {
      if (typeof value === 'object' && value !== null && '$in' in value) {
        // Handle $in operator - create multiple conditions with should
        const inValues = value.$in;
        if (Array.isArray(inValues)) {
          inValues.forEach((val: any) => {
            conditions.push({
              key,
              match: { value: val },
            });
          });
        }
      } else {
        // Simple equality match
        conditions.push({
          key,
          match: { value },
        });
      }
    }

    return conditions;
  }

  async deleteCollection(collectionName: string = "context1000"): Promise<void> {
    try {
      await this.client.deleteCollection(collectionName);
      console.log(`Deleted collection: ${collectionName}`);
    } catch (error) {
      console.warn(`Could not delete collection ${collectionName}:`, error);
    }
  }

  async listCollections(): Promise<string[]> {
    const response = await this.client.getCollections();
    return response.collections.map((c) => c.name);
  }

  async getCollectionInfo(): Promise<any> {
    if (!this.collectionName) {
      throw new Error("Collection not initialized");
    }

    const info = await this.client.getCollection(this.collectionName);

    return {
      name: this.collectionName,
      count: info.points_count || 0,
      metadata: {
        vectorsConfig: info.config?.params?.vectors,
      },
    };
  }
}
