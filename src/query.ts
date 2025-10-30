import "dotenv/config";

import { QdrantClient } from "./qdrant-client.js";

export interface QueryResult {
  document: string;
  metadata: {
    title: string;
    type: string;
    filePath: string;
    tags: string[];
    projects: string[];
    status?: string;
  };
  relevanceScore: number;
}

export class QueryInterface {
  private qdrantClient: QdrantClient;

  constructor() {
    this.qdrantClient = new QdrantClient();
  }

  async initialize(collectionName: string = "context1000", docsPath?: string): Promise<void> {
    await this.qdrantClient.initialize(collectionName, docsPath);
  }

  async queryDocs(
    query: string,
    options: {
      maxResults?: number;
      filterByType?: string[];
      filterByProject?: string[];
    } = {}
  ): Promise<QueryResult[]> {
    const { maxResults = 5, filterByType, filterByProject } = options;

    let whereClause: Record<string, any> | undefined = undefined;

    const conditions: Record<string, any>[] = [];

    if (filterByType && filterByType.length > 0) {
      conditions.push({ type: { $in: filterByType } });
    }

    if (filterByProject && filterByProject.length > 0) {
      conditions.push({ projects: { $in: filterByProject } });
    }

    if (conditions.length > 1) {
      whereClause = { $or: conditions };
    } else if (conditions.length === 1) {
      whereClause = conditions[0];
    }
    const results = await this.qdrantClient.queryDocuments(query, maxResults, whereClause);

    return results.documents.map((doc, index) => ({
      document: doc,
      metadata: {
        title: results.metadatas[index].title,
        type: results.metadatas[index].type,
        filePath: results.metadatas[index].filePath,
        tags: results.metadatas[index].tags,
        projects: results.metadatas[index].projects,
        status: results.metadatas[index].status,
      },
      relevanceScore: 1 - (results.distances[index] || 0),
    }));
  }
}
