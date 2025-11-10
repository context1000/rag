import path from "path";
import { DocumentProcessor, DocumentChunk } from "./document-processor.js";
import { QdrantClient } from "./qdrant-client.js";

const COLLECTION_NAME = "context1000";

function groupChunksByFile(chunks: DocumentChunk[]): Map<string, DocumentChunk[]> {
  return chunks.reduce((map, chunk) => {
    const filePath = chunk.metadata.filePath;
    const existing = map.get(filePath) || [];
    existing.push(chunk);
    map.set(filePath, existing);
    return map;
  }, new Map<string, DocumentChunk[]>());
}

function logIndexedDocuments(chunks: DocumentChunk[]): void {
  console.log("\nIndexed document chunks:");

  const documentsMap = groupChunksByFile(chunks);

  for (const [filePath, fileChunks] of documentsMap) {
    const { title, type } = fileChunks[0].metadata;
    console.log(`- ${title} (${type}) - ${fileChunks.length} chunks - ${filePath}`);
  }
}

async function initializeCollection(client: QdrantClient): Promise<void> {
  await client.deleteCollection(COLLECTION_NAME);
  await client.initialize(COLLECTION_NAME);
}

export async function runIndexer(docsPath: string): Promise<void> {
  const finalDocsPath = path.resolve(docsPath);

  console.log("Starting document indexing...");
  console.log(`Processing documents from: ${finalDocsPath}`);

  const processor = new DocumentProcessor();
  const chunks = await processor.processDocumentsToChunks(finalDocsPath);

  console.log(`Processed ${chunks.length} document chunks`);

  if (chunks.length === 0) {
    console.log("No document chunks to index");
    return;
  }

  const qdrantClient = new QdrantClient();

  await initializeCollection(qdrantClient);
  await qdrantClient.addDocuments(chunks);

  const info = await qdrantClient.getCollectionInfo();
  console.log("Collection info:", info);
  console.log("Document indexing completed successfully!");

  logIndexedDocuments(chunks);
}
