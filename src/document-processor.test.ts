import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { DocumentProcessor, type ProcessedDocument, type DocumentChunk } from "./document-processor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_PATH = path.join(__dirname, "..", "__tests__", "fixtures", ".context1000");

console.log(FIXTURES_PATH);

describe("DocumentProcessor - Integration Tests", () => {
  let processor: DocumentProcessor;
  let processedDocuments: ProcessedDocument[];
  let allChunks: DocumentChunk[];

  before(async () => {
    processor = new DocumentProcessor();
    processedDocuments = await processor.processDocuments(FIXTURES_PATH);
    allChunks = await processor.processDocumentsToChunks(FIXTURES_PATH);
  });

  describe("processDocuments()", () => {
    test("should process all markdown files in fixtures", () => {
      assert.ok(processedDocuments.length > 0, "Should process at least one document");
      console.log(`Processed ${processedDocuments.length} documents`);
    });

    test("should skip files starting with underscore", () => {
      const underscoreFiles = processedDocuments.filter((doc) =>
        path.basename(doc.metadata.filePath).startsWith("_")
      );
      assert.equal(underscoreFiles.length, 0, "Should not process files starting with _");
    });

    test("should extract valid document IDs", () => {
      processedDocuments.forEach((doc) => {
        assert.ok(doc.id, "Document should have an ID");
        assert.ok(doc.id.length > 0, "Document ID should not be empty");
      });
    });
  });

  describe("Document Type Inference", () => {
    test("should correctly identify ADR documents", () => {
      const adrDocs = processedDocuments.filter((doc) => doc.metadata.type === "adr");
      assert.ok(adrDocs.length > 0, "Should find at least one ADR");

      adrDocs.forEach((doc) => {
        const filePath = doc.metadata.filePath;
        const isInAdrPath = filePath.includes("/decisions/adr/");
        const hasAdrExtension = filePath.endsWith(".adr.md");
        assert.ok(
          isInAdrPath || hasAdrExtension,
          `ADR document should be in /decisions/adr/ path or have .adr.md extension: ${filePath}`
        );
      });
    });

    test("should correctly identify RFC documents", () => {
      const rfcDocs = processedDocuments.filter((doc) => doc.metadata.type === "rfc");
      assert.ok(rfcDocs.length > 0, "Should find at least one RFC");

      rfcDocs.forEach((doc) => {
        const filePath = doc.metadata.filePath;
        const isInRfcPath = filePath.includes("/decisions/rfc/");
        const hasRfcExtension = filePath.endsWith(".rfc.md");
        assert.ok(
          isInRfcPath || hasRfcExtension,
          `RFC document should be in /decisions/rfc/ path or have .rfc.md extension: ${filePath}`
        );
      });
    });

    test("should correctly identify Guide documents", () => {
      const guideDocs = processedDocuments.filter((doc) => doc.metadata.type === "guide");
      assert.ok(guideDocs.length > 0, "Should find at least one Guide");

      // Filter only explicit guides (not fallback/default type)
      const explicitGuideDocs = guideDocs.filter((doc) => {
        const filePath = doc.metadata.filePath;
        return filePath.includes("/guides/") || filePath.endsWith(".guide.md");
      });

      assert.ok(
        explicitGuideDocs.length > 0,
        "Should find at least one explicit guide document"
      );

      explicitGuideDocs.forEach((doc) => {
        const filePath = doc.metadata.filePath;
        const isInGuidePath = filePath.includes("/guides/");
        const hasGuideExtension = filePath.endsWith(".guide.md");
        assert.ok(
          isInGuidePath || hasGuideExtension,
          `Guide document should be in /guides/ path or have .guide.md extension: ${filePath}`
        );
      });
    });

    test("should correctly identify Rule documents", () => {
      const ruleDocs = processedDocuments.filter((doc) => doc.metadata.type === "rule");
      assert.ok(ruleDocs.length > 0, "Should find at least one Rule");

      ruleDocs.forEach((doc) => {
        const filePath = doc.metadata.filePath;
        const isInRulePath = filePath.includes("/rules/");
        const hasRuleExtension = filePath.endsWith(".rules.md");
        assert.ok(
          isInRulePath || hasRuleExtension,
          `Rule document should be in /rules/ path or have .rules.md extension: ${filePath}`
        );
      });
    });

    test("should correctly identify Project documents", () => {
      const projectDocs = processedDocuments.filter((doc) => doc.metadata.type === "project");
      if (projectDocs.length > 0) {
        projectDocs.forEach((doc) => {
          const filePath = doc.metadata.filePath;
          const isProjectFile = filePath.includes("/projects/") && path.basename(filePath) === "project.md";
          assert.ok(isProjectFile, `Project document should be project.md in /projects/ path: ${filePath}`);
        });
      }
    });
  });

  describe("Metadata Extraction", () => {
    test("should extract titles from frontmatter", () => {
      const adrDoc = processedDocuments.find((doc) => doc.metadata.filePath.includes("example-adr-1.md"));
      assert.ok(adrDoc, "Should find example-adr-1.md");
      assert.equal(adrDoc.metadata.title, "Example ADR 1");
    });

    test("should extract tags from frontmatter", () => {
      const adrDoc = processedDocuments.find((doc) => doc.metadata.filePath.includes("example-adr-1.md"));
      assert.ok(adrDoc, "Should find example-adr-1.md");
      assert.ok(Array.isArray(adrDoc.metadata.tags), "Tags should be an array");
      assert.ok(adrDoc.metadata.tags.includes("example"), "Should include 'example' tag");
      assert.ok(adrDoc.metadata.tags.includes("adr"), "Should include 'adr' tag");
    });

    test("should validate status for ADRs", () => {
      const adrDoc = processedDocuments.find((doc) => doc.metadata.filePath.includes("example-adr-1.md"));
      assert.ok(adrDoc, "Should find example-adr-1.md");
      assert.equal(adrDoc.metadata.status, "accepted", "Should have 'accepted' status");
    });

    test("should extract related metadata", () => {
      const adrDoc = processedDocuments.find((doc) => doc.metadata.filePath.includes("example-adr-1.md"));
      assert.ok(adrDoc, "Should find example-adr-1.md");
      assert.ok(adrDoc.metadata.related, "Should have related metadata");
      assert.ok(Array.isArray(adrDoc.metadata.related.rfcs), "Should have related RFCs");
      assert.ok(adrDoc.metadata.related.rfcs?.includes("example-rfc-1"), "Should reference example-rfc-1");
    });

    test("should extract depends-on metadata", () => {
      const adrDoc = processedDocuments.find((doc) => doc.metadata.filePath.includes("example-adr-1.md"));
      assert.ok(adrDoc, "Should find example-adr-1.md");
      assert.ok(adrDoc.metadata.related, "Should have related metadata");
      assert.ok(adrDoc.metadata.related["depends-on"], "Should have depends-on metadata");
    });

    test("should extract supersedes metadata", () => {
      const adrDoc = processedDocuments.find((doc) => doc.metadata.filePath.includes("example-adr-1.md"));
      assert.ok(adrDoc, "Should find example-adr-1.md");
      assert.ok(adrDoc.metadata.related, "Should have related metadata");
      assert.ok(adrDoc.metadata.related.supersedes, "Should have supersedes metadata");
    });
  });

  describe("Chunking", () => {
    test("should create chunks for all documents", () => {
      assert.ok(allChunks.length > 0, "Should create at least one chunk");
      console.log(`Created ${allChunks.length} chunks from ${processedDocuments.length} documents`);
    });

    test("should create at least one chunk per document", () => {
      processedDocuments.forEach((doc) => {
        assert.ok(doc.chunks.length > 0, `Document ${doc.id} should have at least one chunk`);
      });
    });

    test("should respect MAX_CHUNK_TOKENS limit", () => {
      const MAX_CHUNK_TOKENS = 1200;
      allChunks.forEach((chunk) => {
        assert.ok(
          chunk.metadata.tokens <= MAX_CHUNK_TOKENS * 1.1, // Allow 10% margin for context addition
          `Chunk ${chunk.id} has ${chunk.metadata.tokens} tokens, exceeds limit of ${MAX_CHUNK_TOKENS}`
        );
      });
    });

    test("should have valid chunk IDs", () => {
      allChunks.forEach((chunk) => {
        assert.ok(chunk.id, "Chunk should have an ID");
        assert.ok(chunk.id.includes("_chunk_"), "Chunk ID should contain '_chunk_'");
      });
    });

    test("should have sequential chunk indices", () => {
      processedDocuments.forEach((doc) => {
        const indices = doc.chunks.map((c) => c.metadata.chunkIndex);
        for (let i = 0; i < indices.length; i++) {
          assert.equal(indices[i], i, `Chunk indices should be sequential starting from 0`);
        }
      });
    });

    test("should have correct totalChunks metadata", () => {
      processedDocuments.forEach((doc) => {
        const totalChunks = doc.chunks.length;
        doc.chunks.forEach((chunk) => {
          assert.equal(
            chunk.metadata.totalChunks,
            totalChunks,
            `All chunks should have totalChunks = ${totalChunks}`
          );
        });
      });
    });

    test("should preserve document metadata in chunks", () => {
      processedDocuments.forEach((doc) => {
        doc.chunks.forEach((chunk) => {
          assert.equal(chunk.metadata.title, doc.metadata.title, "Chunk should preserve document title");
          assert.equal(chunk.metadata.type, doc.metadata.type, "Chunk should preserve document type");
          assert.deepEqual(chunk.metadata.tags, doc.metadata.tags, "Chunk should preserve document tags");
          assert.equal(chunk.metadata.status, doc.metadata.status, "Chunk should preserve document status");
        });
      });
    });

    test("should add document context to chunk content", () => {
      processedDocuments.forEach((doc) => {
        doc.chunks.forEach((chunk) => {
          assert.ok(
            chunk.content.includes(doc.metadata.title),
            "Chunk content should include document title for context"
          );
        });
      });
    });

    test("should infer section types", () => {
      const adrDoc = processedDocuments.find((doc) => doc.metadata.filePath.includes("example-adr-1.md"));
      assert.ok(adrDoc, "Should find example-adr-1.md");

      const contextChunk = adrDoc.chunks.find((c) => c.metadata.sectionType === "context");
      const decisionChunk = adrDoc.chunks.find((c) => c.metadata.sectionType === "decision");
      const consequencesChunk = adrDoc.chunks.find((c) => c.metadata.sectionType === "consequences");

      assert.ok(contextChunk, "Should have a context section");
      assert.ok(decisionChunk, "Should have a decision section");
      assert.ok(consequencesChunk, "Should have a consequences section");
    });

    test("should include section titles in chunk metadata", () => {
      allChunks.forEach((chunk) => {
        if (chunk.metadata.sectionTitle) {
          assert.ok(
            chunk.metadata.sectionTitle.length > 0,
            "Section title should not be empty if present"
          );
        }
      });
    });
  });

  describe("Edge Cases", () => {
    test("should handle documents with no frontmatter gracefully", () => {
      // All chunks should still be created even if frontmatter is missing
      allChunks.forEach((chunk) => {
        assert.ok(chunk.metadata.title, "Should have a title even without frontmatter");
      });
    });

    test("should handle nested directory structures", () => {
      const nestedDocs = processedDocuments.filter((doc) =>
        doc.metadata.filePath.includes("/subdirectory/")
      );
      assert.ok(nestedDocs.length > 0, "Should process documents in subdirectories");
    });

    test("should handle project-scoped documents", () => {
      const projectScopedDocs = processedDocuments.filter(
        (doc) => doc.metadata.filePath.includes("/projects/example-project-1/") &&
                 !doc.metadata.filePath.endsWith("project.md")
      );

      if (projectScopedDocs.length > 0) {
        projectScopedDocs.forEach((doc) => {
          assert.ok(
            doc.metadata.projects.includes("example-project-1"),
            `Document should be associated with example-project-1 project`
          );
        });
      }
    });
  });

  describe("Content Quality", () => {
    test("should not have empty chunks", () => {
      allChunks.forEach((chunk) => {
        assert.ok(chunk.content.trim().length > 0, `Chunk ${chunk.id} should not be empty`);
      });
    });

    test("should have reasonable token estimates", () => {
      allChunks.forEach((chunk) => {
        const contentLength = chunk.content.length;
        const tokens = chunk.metadata.tokens;
        const ratio = contentLength / tokens;

        // Token ratio should be roughly between 3-5 characters per token
        assert.ok(ratio >= 2 && ratio <= 6, `Token estimation ratio (${ratio.toFixed(2)}) seems off for chunk ${chunk.id}`);
      });
    });

    test("should maintain document content in chunks", () => {
      processedDocuments.forEach((doc) => {
        const allChunkContent = doc.chunks.map((c) => c.content).join(" ");

        // Check if original content words appear in chunks (accounting for title duplication)
        const originalWords = doc.content
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .slice(0, 10); // Check first 10 meaningful words

        originalWords.forEach((word) => {
          assert.ok(
            allChunkContent.includes(word),
            `Original content word "${word}" should appear in chunks for document ${doc.id}`
          );
        });
      });
    });
  });

  describe("Performance Characteristics", () => {
    test("should have reasonable chunk distribution", () => {
      const chunksPerDoc = processedDocuments.map((doc) => doc.chunks.length);
      const avgChunksPerDoc = chunksPerDoc.reduce((a, b) => a + b, 0) / chunksPerDoc.length;

      console.log(`Average chunks per document: ${avgChunksPerDoc.toFixed(2)}`);
      console.log(`Min chunks: ${Math.min(...chunksPerDoc)}, Max chunks: ${Math.max(...chunksPerDoc)}`);

      assert.ok(avgChunksPerDoc > 0, "Should have at least one chunk per document on average");
    });

    test("should have consistent token distribution", () => {
      const tokenCounts = allChunks.map((c) => c.metadata.tokens);
      const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;

      console.log(`Average tokens per chunk: ${avgTokens.toFixed(0)}`);
      console.log(`Min tokens: ${Math.min(...tokenCounts)}, Max tokens: ${Math.max(...tokenCounts)}`);

      assert.ok(avgTokens > 0, "Should have non-zero token count");
    });
  });
});
