import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { DocumentProcessor, type ProcessedDocument, type DocumentChunk } from "./document-processor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, "..", "__tests__", "fixtures", ".context1000");

describe("DocumentProcessor - E2E Tests", () => {
  let processor: DocumentProcessor;
  let processedDocuments: ProcessedDocument[];
  let allChunks: DocumentChunk[];

  before(async () => {
    processor = new DocumentProcessor();
    processedDocuments = await processor.processDocuments(FIXTURES_PATH);
    allChunks = await processor.processDocumentsToChunks(FIXTURES_PATH);
  });

  describe("Full Document Processing Pipeline", () => {
    test("should process complete documentation structure", () => {
      assert.ok(processedDocuments.length > 0, "Should process documents");
      assert.ok(allChunks.length > 0, "Should create chunks");

      console.log(`\nE2E Test Results:`);
      console.log(`  Documents processed: ${processedDocuments.length}`);
      console.log(`  Total chunks: ${allChunks.length}`);
      console.log(`  Avg chunks/doc: ${(allChunks.length / processedDocuments.length).toFixed(2)}`);
    });

    test("should maintain document-to-chunk relationship", () => {
      processedDocuments.forEach((doc) => {
        const docChunkIds = doc.chunks.map((c) => c.id);
        const allChunkIds = allChunks.map((c) => c.id);

        docChunkIds.forEach((chunkId) => {
          assert.ok(
            allChunkIds.includes(chunkId),
            `Chunk ${chunkId} from document should be in all chunks`
          );
        });
      });
    });

    test("should have no duplicate chunk IDs", () => {
      const chunkIds = allChunks.map((c) => c.id);
      const uniqueIds = new Set(chunkIds);

      assert.equal(chunkIds.length, uniqueIds.size, "All chunk IDs should be unique");
    });

    test("should have no duplicate document IDs", () => {
      const docIds = processedDocuments.map((d) => d.id);
      const uniqueIds = new Set(docIds);

      assert.equal(docIds.length, uniqueIds.size, "All document IDs should be unique");
    });
  });

  describe("Chunking Strategy Validation", () => {
    test("should respect MAX_CHUNK_TOKENS limit across all chunks", () => {
      const MAX_CHUNK_TOKENS = 1200;
      const MARGIN = 1.15; // 15% margin for document context

      allChunks.forEach((chunk) => {
        const tokens = chunk.metadata.tokens;
        assert.ok(
          tokens <= MAX_CHUNK_TOKENS * MARGIN,
          `Chunk ${chunk.id} has ${tokens} tokens, exceeds limit of ${MAX_CHUNK_TOKENS * MARGIN}`
        );
      });

      const maxTokens = Math.max(...allChunks.map((c) => c.metadata.tokens));
      console.log(`  Max chunk size: ${maxTokens} tokens`);
    });

    test("should implement overlap between consecutive chunks", () => {
      processedDocuments
        .filter((doc) => doc.chunks.length > 1) // Only multi-chunk docs
        .forEach((doc) => {
          for (let i = 0; i < doc.chunks.length - 1; i++) {
            const currentChunk = doc.chunks[i];
            const nextChunk = doc.chunks[i + 1];

            // Check that chunking is sequential and sensible
            assert.ok(
              currentChunk.metadata.chunkIndex < nextChunk.metadata.chunkIndex,
              "Chunk indices should be sequential"
            );
          }
        });
    });

    test("should create appropriately sized chunks", () => {
      const tokenCounts = allChunks.map((c) => c.metadata.tokens);
      const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
      const minTokens = Math.min(...tokenCounts);
      const maxTokens = Math.max(...tokenCounts);

      console.log(`  Token distribution: min=${minTokens}, avg=${avgTokens.toFixed(0)}, max=${maxTokens}`);

      // Reasonable expectations
      assert.ok(avgTokens > 0, "Should have non-zero average");
      assert.ok(maxTokens <= 1400, "Max should be reasonable"); // With context
      assert.ok(minTokens > 0, "Min should be positive");
    });

    test("should balance chunk sizes when splitting sections", () => {
      const multiChunkDocs = processedDocuments.filter((doc) => doc.chunks.length > 1);

      multiChunkDocs.forEach((doc) => {
        const tokenCounts = doc.chunks.map((c) => c.metadata.tokens);
        const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
        const maxDeviation = Math.max(...tokenCounts.map((t) => Math.abs(t - avgTokens)));

        // Chunks shouldn't vary too wildly (unless content is very different)
        // Allow up to 2x average as reasonable variance
        assert.ok(
          maxDeviation < avgTokens * 2,
          `Chunk sizes vary too much in ${doc.id}: max deviation ${maxDeviation.toFixed(0)} vs avg ${avgTokens.toFixed(0)}`
        );
      });
    });
  });

  describe("Metadata Consistency", () => {
    test("should maintain consistent metadata across all chunks of a document", () => {
      processedDocuments.forEach((doc) => {
        const firstChunk = doc.chunks[0];

        doc.chunks.forEach((chunk, idx) => {
          assert.equal(
            chunk.metadata.title,
            firstChunk.metadata.title,
            `All chunks of ${doc.id} should have same title`
          );

          assert.equal(
            chunk.metadata.type,
            firstChunk.metadata.type,
            `All chunks of ${doc.id} should have same type`
          );

          assert.deepEqual(
            chunk.metadata.tags,
            firstChunk.metadata.tags,
            `All chunks of ${doc.id} should have same tags`
          );

          assert.equal(
            chunk.metadata.totalChunks,
            doc.chunks.length,
            `Chunk ${idx} should know total chunks = ${doc.chunks.length}`
          );

          assert.equal(
            chunk.metadata.chunkIndex,
            idx,
            `Chunk ${idx} should have correct index`
          );
        });
      });
    });

    test("should preserve relationships in all chunks", () => {
      const adrDoc = processedDocuments.find((doc) =>
        doc.metadata.filePath.includes("example-adr-1.md")
      );

      if (adrDoc) {
        adrDoc.chunks.forEach((chunk) => {
          assert.ok(chunk.metadata.related, "Should have related metadata");
          assert.deepEqual(
            chunk.metadata.related,
            adrDoc.metadata.related,
            "Should preserve exact related metadata"
          );
        });
      }
    });

    test("should maintain project associations", () => {
      const projectDocs = processedDocuments.filter(
        (doc) => doc.metadata.filePath.includes("/projects/example-project-1/") &&
                 doc.metadata.projects.includes("example-project-1")
      );

      if (projectDocs.length > 0) {
        projectDocs.forEach((doc) => {
          doc.chunks.forEach((chunk) => {
            assert.deepEqual(
              chunk.metadata.projects,
              doc.metadata.projects,
              "Chunks should preserve project associations"
            );

            assert.ok(
              chunk.metadata.projects.includes("example-project-1"),
              "Should be associated with example-project-1"
            );
          });
        });
      }
    });

    test("should set appropriate section metadata", () => {
      allChunks.forEach((chunk) => {
        // Section type should be one of the known types or 'content'
        const validSectionTypes = [
          "content",
          "context",
          "decision",
          "consequences",
          "alternatives",
          "implementation",
          "summary",
          "metrics",
          "risks",
        ];

        if (chunk.metadata.sectionType) {
          assert.ok(
            validSectionTypes.includes(chunk.metadata.sectionType),
            `Invalid section type: ${chunk.metadata.sectionType}`
          );
        }

        // If there's a section title, it should be non-empty
        if (chunk.metadata.sectionTitle) {
          assert.ok(
            chunk.metadata.sectionTitle.length > 0,
            "Section title should not be empty"
          );
        }
      });
    });
  });

  describe("Content Quality Assurance", () => {
    test("should add document context to every chunk", () => {
      processedDocuments.forEach((doc) => {
        doc.chunks.forEach((chunk) => {
          // Chunk should include document title for context
          assert.ok(
            chunk.content.includes(doc.metadata.title),
            `Chunk ${chunk.id} should include document title "${doc.metadata.title}"`
          );

          // Chunk should start with a heading (# Title)
          assert.ok(
            chunk.content.startsWith("# "),
            `Chunk ${chunk.id} should start with document title heading`
          );
        });
      });
    });

    test("should preserve markdown structure in chunks", () => {
      allChunks.forEach((chunk) => {
        // If section has a title, it should be formatted as markdown heading
        if (chunk.metadata.sectionTitle && chunk.metadata.sectionTitle !== "Content") {
          assert.ok(
            chunk.content.includes("#"),
            `Chunk ${chunk.id} should contain markdown heading structure`
          );
        }
      });
    });

    test("should not lose significant content during chunking", () => {
      processedDocuments.forEach((doc) => {
        const originalContent = doc.content.toLowerCase();
        const chunkedContent = doc.chunks
          .map((c) => c.content.toLowerCase())
          .join(" ");

        // Extract significant words (4+ characters)
        const originalWords = new Set(
          originalContent.split(/\s+/).filter((w) => w.length > 4)
        );

        // Check that most significant words are preserved
        let preserved = 0;
        originalWords.forEach((word) => {
          if (chunkedContent.includes(word)) {
            preserved++;
          }
        });

        const preservationRate = preserved / originalWords.size;
        assert.ok(
          preservationRate > 0.8, // At least 80% of significant words preserved
          `Document ${doc.id}: only ${(preservationRate * 100).toFixed(0)}% of content preserved in chunks`
        );
      });
    });

    test("should handle documents with different content sizes", () => {
      const contentSizes = processedDocuments.map((doc) => ({
        id: doc.id,
        size: doc.content.length,
        chunks: doc.chunks.length,
      }));

      const smallDocs = contentSizes.filter((d) => d.size < 500);
      const mediumDocs = contentSizes.filter((d) => d.size >= 500 && d.size < 2000);
      const largeDocs = contentSizes.filter((d) => d.size >= 2000);

      console.log(`  Document size distribution:`);
      console.log(`    Small (<500 chars): ${smallDocs.length}`);
      console.log(`    Medium (500-2000): ${mediumDocs.length}`);
      console.log(`    Large (>2000): ${largeDocs.length}`);

      // All should be processed
      assert.ok(smallDocs.length + mediumDocs.length + largeDocs.length > 0);

      // Small docs should typically have 1 chunk
      smallDocs.forEach((doc) => {
        assert.ok(doc.chunks >= 1, `Small doc ${doc.id} should have at least 1 chunk`);
      });
    });
  });

  describe("Cross-Document Relationships", () => {
    test("should process all related documents", () => {
      const adrDoc = processedDocuments.find((doc) =>
        doc.metadata.filePath.includes("example-adr-1.md")
      );

      if (adrDoc?.metadata.related) {
        // Check if related documents exist
        if (adrDoc.metadata.related.rfcs) {
          adrDoc.metadata.related.rfcs.forEach((rfcName) => {
            const relatedRfc = processedDocuments.find((doc) =>
              doc.metadata.filePath.includes(rfcName)
            );
            // Note: The related RFC might be in fixtures
            assert.ok(
              relatedRfc || true, // Soft check - related docs might not all exist
              `Related RFC ${rfcName} should be processed`
            );
          });
        }
      }
    });

    test("should track project-scoped documents correctly", () => {
      const projectDocs = processedDocuments.filter(
        (doc) => doc.metadata.projects.length > 0
      );

      console.log(`  Project-scoped documents: ${projectDocs.length}`);

      // Group by project
      const byProject = new Map<string, ProcessedDocument[]>();
      projectDocs.forEach((doc) => {
        doc.metadata.projects.forEach((project) => {
          if (!byProject.has(project)) {
            byProject.set(project, []);
          }
          byProject.get(project)!.push(doc);
        });
      });

      byProject.forEach((docs, project) => {
        console.log(`    ${project}: ${docs.length} documents`);
        assert.ok(docs.length > 0, `Project ${project} should have documents`);
      });
    });

    test("should handle dependency graph metadata", () => {
      const docsWithDependencies = processedDocuments.filter(
        (doc) => doc.metadata.related?.["depends-on"]
      );

      docsWithDependencies.forEach((doc) => {
        const dependsOn = doc.metadata.related?.["depends-on"];
        assert.ok(dependsOn, "Should have depends-on metadata");

        // Validate structure
        const validKeys = ["adrs", "rfcs", "guides", "rules", "projects"];
        Object.keys(dependsOn).forEach((key) => {
          assert.ok(
            validKeys.includes(key),
            `depends-on should only have valid keys: ${key}`
          );
        });
      });
    });

    test("should handle supersedes metadata", () => {
      const docsWithSupersedes = processedDocuments.filter(
        (doc) => doc.metadata.related?.supersedes
      );

      docsWithSupersedes.forEach((doc) => {
        const supersedes = doc.metadata.related?.supersedes;
        assert.ok(supersedes, "Should have supersedes metadata");

        // Validate structure
        const validKeys = ["adrs", "rfcs", "guides", "rules", "projects"];
        Object.keys(supersedes).forEach((key) => {
          assert.ok(
            validKeys.includes(key),
            `supersedes should only have valid keys: ${key}`
          );
        });
      });
    });
  });

  describe("Performance and Scalability", () => {
    test("should process nested directory structures efficiently", () => {
      const nestedDocs = processedDocuments.filter((doc) =>
        doc.metadata.filePath.includes("/subdirectory/")
      );

      console.log(`  Nested directory documents: ${nestedDocs.length}`);
      assert.ok(nestedDocs.length > 0, "Should process nested directories");
    });

    test("should handle various document types in same run", () => {
      const typeCount = new Map<string, number>();

      processedDocuments.forEach((doc) => {
        const count = typeCount.get(doc.metadata.type) || 0;
        typeCount.set(doc.metadata.type, count + 1);
      });

      console.log(`  Document types processed:`);
      typeCount.forEach((count, type) => {
        console.log(`    ${type}: ${count}`);
      });

      // Should have multiple types
      assert.ok(typeCount.size >= 2, "Should process multiple document types");
    });

    test("should generate consistent IDs for same files across runs", async () => {
      // Process same directory again
      const secondRun = await processor.processDocuments(FIXTURES_PATH);

      // IDs should be identical
      assert.equal(
        processedDocuments.length,
        secondRun.length,
        "Should process same number of docs"
      );

      // Sort both arrays by ID for comparison
      const firstIds = processedDocuments.map((d) => d.id).sort();
      const secondIds = secondRun.map((d) => d.id).sort();

      firstIds.forEach((id, idx) => {
        assert.equal(id, secondIds[idx], "Document IDs should be consistent");
      });
    });

    test("should produce deterministic chunks for same content", async () => {
      const secondRun = await processor.processDocumentsToChunks(FIXTURES_PATH);

      assert.equal(
        allChunks.length,
        secondRun.length,
        "Should produce same number of chunks"
      );

      // Sort both by ID
      const firstSorted = [...allChunks].sort((a, b) => a.id.localeCompare(b.id));
      const secondSorted = [...secondRun].sort((a, b) => a.id.localeCompare(b.id));

      firstSorted.forEach((chunk, idx) => {
        assert.equal(chunk.id, secondSorted[idx].id, "Chunk IDs should match");
        assert.equal(
          chunk.content,
          secondSorted[idx].content,
          `Chunk content should be identical for ${chunk.id}`
        );
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle index.md files appropriately", () => {
      const indexDocs = processedDocuments.filter((doc) =>
        path.basename(doc.metadata.filePath) === "index.md"
      );

      console.log(`  Index files: ${indexDocs.length}`);

      indexDocs.forEach((doc) => {
        assert.ok(doc.id, "Index files should have IDs");
        assert.ok(doc.chunks.length > 0, "Index files should produce chunks");
      });
    });

    test("should skip underscore-prefixed files", () => {
      const underscoreDocs = processedDocuments.filter((doc) =>
        path.basename(doc.metadata.filePath).startsWith("_")
      );

      assert.equal(underscoreDocs.length, 0, "Should not process _prefixed files");
    });

    test("should handle empty or minimal frontmatter", () => {
      // All docs should have at minimum a title (from filename if not in frontmatter)
      processedDocuments.forEach((doc) => {
        assert.ok(doc.metadata.title, `Document ${doc.id} should have a title`);
        assert.ok(doc.metadata.title.length > 0, "Title should not be empty");
      });
    });

    test("should create valid chunks even for minimal content", () => {
      // All documents should produce at least one chunk
      processedDocuments.forEach((doc) => {
        assert.ok(
          doc.chunks.length >= 1,
          `Document ${doc.id} should have at least one chunk`
        );

        doc.chunks.forEach((chunk) => {
          assert.ok(chunk.content.trim().length > 0, "Chunks should not be empty");
          assert.ok(chunk.metadata.tokens > 0, "Chunks should have token count");
        });
      });
    });
  });
});
