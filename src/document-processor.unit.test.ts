import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DocumentProcessor } from "./document-processor.js";

describe("DocumentProcessor - Unit Tests", () => {
  const processor = new DocumentProcessor();
  // Type cast to access private methods for testing
  const privateProcessor = processor as any;

  describe("estimateTokens()", () => {
    test("should estimate tokens for short text", () => {
      const text = "Hello world";
      const tokens = privateProcessor.estimateTokens(text);
      // "Hello world" = 11 characters / 4 ≈ 3 tokens
      assert.ok(tokens >= 2 && tokens <= 4, `Expected 2-4 tokens, got ${tokens}`);
    });

    test("should estimate tokens for longer text", () => {
      const text = "This is a longer sentence with multiple words that should be tokenized correctly.";
      const tokens = privateProcessor.estimateTokens(text);
      // 82 characters / 4 ≈ 20-21 tokens
      assert.ok(tokens >= 18 && tokens <= 25, `Expected 18-25 tokens, got ${tokens}`);
    });

    test("should handle empty text", () => {
      const tokens = privateProcessor.estimateTokens("");
      assert.equal(tokens, 0, "Empty text should have 0 tokens");
    });

    test("should handle whitespace-only text", () => {
      const tokens = privateProcessor.estimateTokens("   \n\t  ");
      assert.ok(tokens >= 0 && tokens <= 2, "Whitespace should have minimal tokens");
    });

    test("should estimate code snippets reasonably", () => {
      const code = `function hello() {\n  return "world";\n}`;
      const tokens = privateProcessor.estimateTokens(code);
      // ~40 characters / 4 ≈ 10 tokens
      assert.ok(tokens >= 8 && tokens <= 12, `Expected 8-12 tokens for code, got ${tokens}`);
    });

    test("should handle markdown formatting", () => {
      const markdown = "# Heading\n\n**Bold text** and *italic*";
      const tokens = privateProcessor.estimateTokens(markdown);
      // ~41 characters / 4 ≈ 10 tokens
      assert.ok(tokens >= 8 && tokens <= 13, `Expected 8-13 tokens for markdown, got ${tokens}`);
    });
  });

  describe("inferSectionType()", () => {
    test("should identify context sections", () => {
      assert.equal(privateProcessor.inferSectionType("Context"), "context");
      assert.equal(privateProcessor.inferSectionType("Background"), "context");
      assert.equal(privateProcessor.inferSectionType("Problem Statement"), "context");
      assert.equal(privateProcessor.inferSectionType("Motivation"), "context");
      assert.equal(privateProcessor.inferSectionType("Why we need this"), "context");
    });

    test("should identify decision sections", () => {
      assert.equal(privateProcessor.inferSectionType("Decision"), "decision");
      assert.equal(privateProcessor.inferSectionType("Solution"), "decision");
      assert.equal(privateProcessor.inferSectionType("Approach"), "decision");
      assert.equal(privateProcessor.inferSectionType("Proposal"), "decision");
      assert.equal(privateProcessor.inferSectionType("Chosen Solution"), "decision");
    });

    test("should identify consequences sections", () => {
      assert.equal(privateProcessor.inferSectionType("Consequences"), "consequences");
      assert.equal(privateProcessor.inferSectionType("Impact"), "consequences");
      assert.equal(privateProcessor.inferSectionType("Tradeoffs"), "consequences");
      assert.equal(privateProcessor.inferSectionType("Implications"), "consequences");
    });

    test("should identify alternatives sections", () => {
      assert.equal(privateProcessor.inferSectionType("Alternatives"), "alternatives");
      assert.equal(privateProcessor.inferSectionType("Alternatives Considered"), "alternatives");
      assert.equal(privateProcessor.inferSectionType("Rejected Options"), "alternatives");
    });

    test("should identify implementation sections", () => {
      assert.equal(privateProcessor.inferSectionType("Implementation"), "implementation");
      assert.equal(privateProcessor.inferSectionType("Implementation Plan"), "implementation");
      assert.equal(privateProcessor.inferSectionType("Rollout Strategy"), "implementation");
      assert.equal(privateProcessor.inferSectionType("Migration Path"), "implementation");
    });

    test("should identify summary sections", () => {
      assert.equal(privateProcessor.inferSectionType("Summary"), "summary");
      assert.equal(privateProcessor.inferSectionType("Overview"), "summary");
      assert.equal(privateProcessor.inferSectionType("TLDR"), "summary");
      assert.equal(privateProcessor.inferSectionType("Intro"), "summary");
    });

    test("should identify metrics sections", () => {
      assert.equal(privateProcessor.inferSectionType("Metrics"), "metrics");
      assert.equal(privateProcessor.inferSectionType("Success Criteria"), "metrics");
      assert.equal(privateProcessor.inferSectionType("KPIs"), "metrics");
    });

    test("should identify risks sections", () => {
      assert.equal(privateProcessor.inferSectionType("Risks"), "risks");
      assert.equal(privateProcessor.inferSectionType("Concerns"), "risks");
      assert.equal(privateProcessor.inferSectionType("Open Questions"), "risks");
    });

    test("should handle case insensitivity", () => {
      assert.equal(privateProcessor.inferSectionType("CONTEXT"), "context");
      assert.equal(privateProcessor.inferSectionType("dEcIsIoN"), "decision");
    });

    test("should return 'content' for unrecognized sections", () => {
      assert.equal(privateProcessor.inferSectionType("Random Section"), "content");
      assert.equal(privateProcessor.inferSectionType("Appendix"), "content");
      assert.equal(privateProcessor.inferSectionType("Notes"), "content");
    });
  });

  describe("inferDocumentType()", () => {
    test("should detect ADR by file extension", () => {
      const type = privateProcessor.inferDocumentType("/path/to/document.adr.md");
      assert.equal(type, "adr");
    });

    test("should detect ADR by path", () => {
      const type = privateProcessor.inferDocumentType("/docs/.context1000/decisions/adr/my-decision.md");
      assert.equal(type, "adr");
    });

    test("should detect RFC by file extension", () => {
      const type = privateProcessor.inferDocumentType("/path/to/proposal.rfc.md");
      assert.equal(type, "rfc");
    });

    test("should detect RFC by path", () => {
      const type = privateProcessor.inferDocumentType("/docs/.context1000/decisions/rfc/new-api.md");
      assert.equal(type, "rfc");
    });

    test("should detect Guide by file extension", () => {
      const type = privateProcessor.inferDocumentType("/path/to/howto.guide.md");
      assert.equal(type, "guide");
    });

    test("should detect Guide by path", () => {
      const type = privateProcessor.inferDocumentType("/docs/.context1000/guides/getting-started.md");
      assert.equal(type, "guide");
    });

    test("should detect Rule by file extension", () => {
      const type = privateProcessor.inferDocumentType("/path/to/coding-standards.rules.md");
      assert.equal(type, "rule");
    });

    test("should detect Rule by path", () => {
      const type = privateProcessor.inferDocumentType("/docs/.context1000/rules/naming-conventions.md");
      assert.equal(type, "rule");
    });

    test("should detect Project by filename and path", () => {
      const type = privateProcessor.inferDocumentType("/docs/.context1000/projects/my-project/project.md");
      assert.equal(type, "project");
    });

    test("should detect Project documents in project scope", () => {
      const type = privateProcessor.inferDocumentType("/docs/.context1000/projects/my-project/overview.md");
      assert.equal(type, "project");
    });

    test("should handle Windows-style paths", () => {
      const type = privateProcessor.inferDocumentType("C:\\docs\\.context1000\\decisions\\adr\\my-decision.md");
      assert.equal(type, "adr");
    });

    test("should default to 'guide' for unrecognized paths", () => {
      const type = privateProcessor.inferDocumentType("/random/path/document.md");
      assert.equal(type, "guide");
    });

    test("should prioritize file extension over path", () => {
      // File with .adr.md extension in guides folder should still be ADR
      const type = privateProcessor.inferDocumentType("/docs/.context1000/guides/something.adr.md");
      assert.equal(type, "adr");
    });
  });

  describe("validateStatus()", () => {
    test("should validate ADR statuses", () => {
      assert.equal(privateProcessor.validateStatus("draft", "adr"), "draft");
      assert.equal(privateProcessor.validateStatus("accepted", "adr"), "accepted");
      assert.equal(privateProcessor.validateStatus("rejected", "adr"), "rejected");
      assert.equal(privateProcessor.validateStatus("deprecated", "adr"), "deprecated");
      assert.equal(privateProcessor.validateStatus("superseded", "adr"), "superseded");
    });

    test("should validate RFC statuses", () => {
      assert.equal(privateProcessor.validateStatus("draft", "rfc"), "draft");
      assert.equal(privateProcessor.validateStatus("review", "rfc"), "review");
      assert.equal(privateProcessor.validateStatus("accepted", "rfc"), "accepted");
      assert.equal(privateProcessor.validateStatus("rejected", "rfc"), "rejected");
      assert.equal(privateProcessor.validateStatus("implemented", "rfc"), "implemented");
    });

    test("should validate Project statuses", () => {
      assert.equal(privateProcessor.validateStatus("active", "project"), "active");
      assert.equal(privateProcessor.validateStatus("inactive", "project"), "inactive");
      assert.equal(privateProcessor.validateStatus("archived", "project"), "archived");
      assert.equal(privateProcessor.validateStatus("planning", "project"), "planning");
    });

    test("should handle case-insensitive status matching", () => {
      assert.equal(privateProcessor.validateStatus("ACCEPTED", "adr"), "ACCEPTED");
      assert.equal(privateProcessor.validateStatus("Draft", "rfc"), "Draft");
    });

    test("should return undefined for invalid ADR status", () => {
      assert.equal(privateProcessor.validateStatus("invalid", "adr"), undefined);
      assert.equal(privateProcessor.validateStatus("approved", "adr"), undefined);
    });

    test("should return undefined for invalid RFC status", () => {
      assert.equal(privateProcessor.validateStatus("invalid", "rfc"), undefined);
      assert.equal(privateProcessor.validateStatus("approved", "rfc"), undefined);
    });

    test("should accept any status for Guide (no validation)", () => {
      assert.equal(privateProcessor.validateStatus("anything", "guide"), "anything");
      assert.equal(privateProcessor.validateStatus("custom-status", "guide"), "custom-status");
    });

    test("should accept any status for Rule (no validation)", () => {
      assert.equal(privateProcessor.validateStatus("anything", "rule"), "anything");
      assert.equal(privateProcessor.validateStatus("custom-status", "rule"), "custom-status");
    });

    test("should return undefined for null/undefined status", () => {
      assert.equal(privateProcessor.validateStatus(null, "adr"), undefined);
      assert.equal(privateProcessor.validateStatus(undefined, "adr"), undefined);
    });

    test("should return undefined for non-string status", () => {
      assert.equal(privateProcessor.validateStatus(123, "adr"), undefined);
      assert.equal(privateProcessor.validateStatus({}, "adr"), undefined);
      assert.equal(privateProcessor.validateStatus([], "adr"), undefined);
    });
  });

  describe("extractTitle()", () => {
    test("should extract title from frontmatter.title", () => {
      const frontmatter = { title: "My Document Title" };
      const title = privateProcessor.extractTitle(frontmatter, "/path/to/file.md");
      assert.equal(title, "My Document Title");
    });

    test("should fall back to frontmatter.name if no title", () => {
      const frontmatter = { name: "my-document-name" };
      const title = privateProcessor.extractTitle(frontmatter, "/path/to/file.md");
      assert.equal(title, "my-document-name");
    });

    test("should fall back to filename if no title or name", () => {
      const frontmatter = {};
      const title = privateProcessor.extractTitle(frontmatter, "/path/to/my-file.md");
      assert.equal(title, "my-file");
    });

    test("should prefer title over name", () => {
      const frontmatter = { title: "Title", name: "name" };
      const title = privateProcessor.extractTitle(frontmatter, "/path/to/file.md");
      assert.equal(title, "Title");
    });

    test("should handle paths with multiple extensions", () => {
      const frontmatter = {};
      const title = privateProcessor.extractTitle(frontmatter, "/path/to/file.adr.md");
      assert.equal(title, "file.adr");
    });

    test("should handle empty frontmatter", () => {
      const frontmatter = {};
      const title = privateProcessor.extractTitle(frontmatter, "/path/to/document.md");
      assert.equal(title, "document");
    });

    test("should ignore non-string title values", () => {
      const frontmatter = { title: 123, name: "fallback-name" };
      const title = privateProcessor.extractTitle(frontmatter, "/path/to/file.md");
      assert.equal(title, "fallback-name");
    });
  });

  describe("splitIntoSentences()", () => {
    test("should split text by periods", () => {
      const text = "First sentence. Second sentence. Third sentence.";
      const sentences = privateProcessor.splitIntoSentences(text);
      assert.equal(sentences.length, 3);
      assert.ok(sentences[0].includes("First"));
      assert.ok(sentences[1].includes("Second"));
      assert.ok(sentences[2].includes("Third"));
    });

    test("should split text by exclamation marks", () => {
      const text = "Hello! How are you! Great!";
      const sentences = privateProcessor.splitIntoSentences(text);
      assert.equal(sentences.length, 3);
    });

    test("should split text by question marks", () => {
      const text = "What is this? Why here? How now?";
      const sentences = privateProcessor.splitIntoSentences(text);
      assert.equal(sentences.length, 3);
    });

    test("should handle mixed punctuation", () => {
      const text = "Statement. Question? Exclamation!";
      const sentences = privateProcessor.splitIntoSentences(text);
      assert.equal(sentences.length, 3);
    });

    test("should handle text without sentence boundaries", () => {
      const text = "Just one long sentence without proper ending";
      const sentences = privateProcessor.splitIntoSentences(text);
      assert.ok(sentences.length >= 1);
    });

    test("should trim whitespace from sentences", () => {
      const text = "First.   Second.    Third.";
      const sentences = privateProcessor.splitIntoSentences(text);
      sentences.forEach((s: string) => {
        assert.equal(s, s.trim(), "Sentence should be trimmed");
      });
    });

    test("should filter out empty sentences", () => {
      const text = "First.. Second... Third....";
      const sentences = privateProcessor.splitIntoSentences(text);
      sentences.forEach((s: string) => {
        assert.ok(s.length > 0, "Should not have empty sentences");
      });
    });

    test("should handle newlines as sentence boundaries", () => {
      const text = "First line\nSecond line\nThird line";
      const sentences = privateProcessor.splitIntoSentences(text);
      assert.ok(sentences.length >= 1);
    });

    test("should handle abbreviations gracefully", () => {
      // Note: Simple regex may split on abbreviations like "Dr.", "Inc.", etc.
      // This is acceptable for chunking purposes
      const text = "Dr. Smith works at Acme Inc. He is great.";
      const sentences = privateProcessor.splitIntoSentences(text);
      assert.ok(sentences.length > 0);
    });
  });

  describe("getLastNTokensOfText()", () => {
    test("should return last N tokens of text", () => {
      const text = "First sentence here with some words. Second sentence also with words. Third sentence has content. Fourth sentence that we want to extract for testing.";
      const result = privateProcessor.getLastNTokensOfText(text, 15);

      assert.ok(result.length > 0, "Should return some text");
      assert.ok(result.includes("extract") || result.includes("testing"), "Should include end of text");
    });

    test("should return full text if under token limit", () => {
      const text = "Short text.";
      const result = privateProcessor.getLastNTokensOfText(text, 100);

      assert.ok(result.includes("Short"), "Should include original text");
    });

    test("should handle empty text", () => {
      const result = privateProcessor.getLastNTokensOfText("", 10);
      assert.equal(result, "", "Should return empty string");
    });

    test("should extract from sentence boundaries", () => {
      const text = "First sentence. Second sentence. Third sentence. Fourth sentence.";
      const result = privateProcessor.getLastNTokensOfText(text, 10);

      // Should include complete sentences from the end
      assert.ok(result.includes("sentence"), "Should include sentence");
      assert.ok(!result.includes("First"), "Should not include beginning");
    });

    test("should trim result", () => {
      const text = "Some text with spaces.   ";
      const result = privateProcessor.getLastNTokensOfText(text, 10);
      assert.equal(result, result.trim(), "Result should be trimmed");
    });

    test("should handle single sentence", () => {
      const text = "Just one sentence here.";
      const result = privateProcessor.getLastNTokensOfText(text, 10);
      assert.ok(result.length > 0, "Should return some text");
      assert.ok(result.includes("sentence"), "Should include the sentence");
    });

    test("should respect token limit approximately", () => {
      // Create text with proper sentence boundaries
      const sentences = Array(20).fill("This is a test sentence.").join(" ");
      const result = privateProcessor.getLastNTokensOfText(sentences, 20);
      const estimatedTokens = privateProcessor.estimateTokens(result);

      // Should be close to 20 tokens (within reasonable margin)
      // May return more if minimum is one complete sentence
      assert.ok(estimatedTokens >= 5 && estimatedTokens <= 30, `Should be close to 20 tokens, got ${estimatedTokens}`);
    });
  });

  describe("generateDocumentId()", () => {
    test("should generate ID from file path", () => {
      // Note: This is path-dependent on current working directory
      const id = privateProcessor.generateDocumentId("/some/absolute/path/doc.md");

      assert.ok(typeof id === "string", "Should return a string");
      assert.ok(id.length > 0, "ID should not be empty");
      assert.ok(!id.endsWith(".md"), "Should remove .md extension");
      assert.ok(id.includes("_"), "Should use underscores as separators");
    });

    test("should replace slashes with underscores", () => {
      const id = privateProcessor.generateDocumentId("/path/to/my/document.md");

      assert.ok(!id.includes("/"), "Should not contain slashes");
      assert.ok(id.includes("_"), "Should contain underscores");
    });

    test("should remove .md extension", () => {
      const id = privateProcessor.generateDocumentId("/path/to/document.md");

      assert.ok(!id.endsWith(".md"), "Should not end with .md");
    });
  });
});
