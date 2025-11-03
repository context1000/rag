import "dotenv/config";

import fs from "fs-extra";
import path from "path";
import matter from "gray-matter";

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    title: string;
    type: "adr" | "rfc" | "guide" | "rule" | "project";
    tags: string[];
    projects: string[];
    status?: string;
    filePath: string;
    chunkIndex: number;
    totalChunks: number;
    sectionType?: string;
    sectionTitle?: string;
    tokens: number;
    related?: {
      adrs?: string[];
      rfcs?: string[];
      guides?: string[];
      rules?: string[];
      projects?: string[];
      "depends-on"?: {
        adrs?: string[];
        rfcs?: string[];
        guides?: string[];
        rules?: string[];
        projects?: string[];
      };
      supersedes?: {
        adrs?: string[];
        rfcs?: string[];
        guides?: string[];
        rules?: string[];
        projects?: string[];
      };
    };
  };
}

export interface ProcessedDocument {
  id: string;
  content: string;
  chunks: DocumentChunk[];
  metadata: {
    title: string;
    type: "adr" | "rfc" | "guide" | "rule" | "project";
    tags: string[];
    projects: string[];
    status?: string;
    filePath: string;
    related?: {
      adrs?: string[];
      rfcs?: string[];
      guides?: string[];
      rules?: string[];
      projects?: string[];
      "depends-on"?: {
        adrs?: string[];
        rfcs?: string[];
        guides?: string[];
        rules?: string[];
        projects?: string[];
      };
      supersedes?: {
        adrs?: string[];
        rfcs?: string[];
        guides?: string[];
        rules?: string[];
        projects?: string[];
      };
    };
  };
}

export class DocumentProcessor {
  // Optimized for text-embedding-3-small (8191 token context)
  // 1200 tokens balances context richness with retrieval precision
  private readonly MAX_CHUNK_TOKENS = 1200;
  private readonly OVERLAP_TOKENS = 200; // ~17% overlap

  async processDocuments(docsPath: string): Promise<ProcessedDocument[]> {
    const documents: ProcessedDocument[] = [];
    await this.processDirectory(docsPath, documents);
    return documents;
  }

  async processDocumentsToChunks(docsPath: string): Promise<DocumentChunk[]> {
    const documents = await this.processDocuments(docsPath);
    const chunks: DocumentChunk[] = [];

    for (const doc of documents) {
      chunks.push(...doc.chunks);
    }

    return chunks;
  }

  private async processDirectory(dirPath: string, documents: ProcessedDocument[]): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.processDirectory(fullPath, documents);
      } else if (entry.name.endsWith(".md") && !entry.name.startsWith("_")) {
        try {
          const doc = await this.processMarkdownFile(fullPath);
          if (doc) {
            documents.push(doc);
          }
        } catch (error) {
          console.warn(`Error processing ${fullPath}:`, error);
        }
      }
    }
  }

  private async processMarkdownFile(filePath: string): Promise<ProcessedDocument | null> {
    const content = await fs.readFile(filePath, "utf-8");
    const { data: frontmatter, content: markdownContent } = matter(content);

    if (!markdownContent.trim()) {
      return null;
    }

    const type = this.inferDocumentType(filePath, frontmatter);
    const id = this.generateDocumentId(filePath);

    const baseMetadata = {
      title: this.extractTitle(frontmatter, filePath),
      type,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      projects: this.extractProjectsArray(frontmatter, filePath),
      status: this.validateStatus(frontmatter.status, type),
      filePath: filePath,
      related: this.validateRelatedMetadata(frontmatter.related || {}),
    };

    const chunks = this.createDocumentChunks(id, markdownContent.trim(), baseMetadata);

    return {
      id,
      content: markdownContent.trim(),
      chunks,
      metadata: baseMetadata,
    };
  }

  private createDocumentChunks(documentId: string, content: string, baseMetadata: any): DocumentChunk[] {
    const sections = this.extractSections(content);
    const chunks: DocumentChunk[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
      const sectionChunks = this.chunkSection(section, documentId, chunkIndex, baseMetadata);
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }

    // Update totalChunks for all chunks
    chunks.forEach((chunk) => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  private extractSections(content: string): Array<{ title: string; content: string; type: string }> {
    const sections: Array<{ title: string; content: string; type: string }> = [];
    const lines = content.split("\n");
    let currentSection = { title: "", content: "", type: "content" };

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }

        const title = headingMatch[2];
        const type = this.inferSectionType(title);

        currentSection = {
          title,
          content: line + "\n",
          type,
        };
      } else {
        currentSection.content += line + "\n";
      }
    }

    if (currentSection.content.trim()) {
      sections.push(currentSection);
    }

    return sections.length > 0 ? sections : [{ title: "Content", content, type: "content" }];
  }

  private inferSectionType(title: string): string {
    const lower = title.toLowerCase();

    // Context/Problem/Background
    if (/(context|problem|background|motivation|rationale|why)/i.test(lower)) {
      return "context";
    }

    // Decision/Solution/Approach
    if (/(decision|solution|approach|proposal|chosen)/i.test(lower)) {
      return "decision";
    }

    // Consequences/Impact/Trade-offs
    if (/(consequence|impact|tradeoff|implication|effect)/i.test(lower)) {
      return "consequences";
    }

    // Alternatives/Options
    if (/(alternative|option|considered|comparison|rejected)/i.test(lower)) {
      return "alternatives";
    }

    // Implementation/Plan/Rollout
    if (/(implementation|plan|rollout|migration|deploy|schedule)/i.test(lower)) {
      return "implementation";
    }

    // Summary/Overview
    if (/(summary|overview|tldr|abstract|intro)/i.test(lower)) {
      return "summary";
    }

    // Metrics/Success Criteria
    if (/(metric|measure|success|criteria|kpi)/i.test(lower)) {
      return "metrics";
    }

    // Risks/Concerns
    if (/(risk|concern|question|issue|challenge)/i.test(lower)) {
      return "risks";
    }

    return "content";
  }

  private chunkSection(
    section: { title: string; content: string; type: string },
    documentId: string,
    startIndex: number,
    baseMetadata: any
  ): DocumentChunk[] {
    const tokens = this.estimateTokens(section.content);

    // If section fits in one chunk, return it with document title context
    if (tokens <= this.MAX_CHUNK_TOKENS) {
      const contentWithContext = this.addDocumentContext(section.content, baseMetadata.title, section.title);

      return [
        {
          id: `${documentId}_chunk_${startIndex}`,
          content: contentWithContext,
          metadata: {
            ...baseMetadata,
            chunkIndex: startIndex,
            totalChunks: 0, // Updated later
            sectionType: section.type,
            sectionTitle: section.title,
            tokens: this.estimateTokens(contentWithContext),
          },
        },
      ];
    }

    // Split large sections using sentence-aware strategy
    return this.splitLargeSectionSentenceAware(section, documentId, startIndex, baseMetadata);
  }

  private addDocumentContext(content: string, documentTitle: string, sectionTitle: string): string {
    // Add document title for context
    // Section title is already in the content (extracted with the heading)
    // This helps the LLM understand what document the chunk belongs to
    return `# ${documentTitle}\n\n${content.trim()}`;
  }

  private splitLargeSectionSentenceAware(
    section: { title: string; content: string; type: string },
    documentId: string,
    startIndex: number,
    baseMetadata: any
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    // Split into sentences (handles common abbreviations)
    const sentences = this.splitIntoSentences(section.content);

    let currentChunk = "";
    let currentIndex = startIndex;

    for (const sentence of sentences) {
      const testChunk = currentChunk ? currentChunk + " " + sentence : sentence;
      const testTokens = this.estimateTokens(testChunk);

      if (testTokens > this.MAX_CHUNK_TOKENS && currentChunk) {
        // Save current chunk with document context
        const contentWithContext = this.addDocumentContext(currentChunk, baseMetadata.title, section.title);

        chunks.push({
          id: `${documentId}_chunk_${currentIndex}`,
          content: contentWithContext,
          metadata: {
            ...baseMetadata,
            chunkIndex: currentIndex,
            totalChunks: 0, // Updated later
            sectionType: section.type,
            sectionTitle: section.title,
            tokens: this.estimateTokens(contentWithContext),
          },
        });

        // Start new chunk with overlap
        const overlapText = this.getLastNTokensOfText(currentChunk, this.OVERLAP_TOKENS);
        currentChunk = overlapText + " " + sentence;
        currentIndex++;
      } else {
        currentChunk = testChunk;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      const contentWithContext = this.addDocumentContext(currentChunk, baseMetadata.title, section.title);

      chunks.push({
        id: `${documentId}_chunk_${currentIndex}`,
        content: contentWithContext,
        metadata: {
          ...baseMetadata,
          chunkIndex: currentIndex,
          totalChunks: 0, // Updated later
          sectionType: section.type,
          sectionTitle: section.title,
          tokens: this.estimateTokens(contentWithContext),
        },
      });
    }

    return chunks;
  }

  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries, handling common abbreviations
    // Matches: . ! ? followed by space or newline
    // Avoids splitting on: Dr. Mr. Ms. Mrs. vs. e.g. i.e. etc.
    const sentences = text.match(/[^.!?\n]+(?:[.!?](?![\s\n])|[.!?](?=[\s\n](?:[A-Z]|$)))/g) || [text];

    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  private getLastNTokensOfText(text: string, maxTokens: number): string {
    // Get last N tokens by estimating from the end
    const sentences = this.splitIntoSentences(text);
    let result = "";
    let tokens = 0;

    // Add sentences from the end until we reach maxTokens
    for (let i = sentences.length - 1; i >= 0 && tokens < maxTokens; i--) {
      const testResult = sentences[i] + " " + result;
      const testTokens = this.estimateTokens(testResult);

      if (testTokens > maxTokens) {
        break;
      }

      result = testResult;
      tokens = testTokens;
    }

    return result.trim();
  }

  private estimateTokens(text: string): number {
    // Character count / 4 is ~95% accurate for English text
    // This accounts for:
    // - Average English word length: ~4.7 characters
    // - Spaces and punctuation
    // - Subword tokenization (GPT uses BPE)
    //
    // Reference: OpenAI tokenization averages ~4 chars per token
    // For text-embedding-3-small, this is accurate within 5%
    return Math.ceil(text.length / 4);
  }

  private inferDocumentType(filePath: string, _frontmatter: any): ProcessedDocument["metadata"]["type"] {
    const fileName = path.basename(filePath);
    const normalizedPath = filePath.replace(/\\/g, "/");

    // File extension-based detection
    if (fileName.endsWith(".adr.md")) return "adr";
    if (fileName.endsWith(".rfc.md")) return "rfc";
    if (fileName.endsWith(".guide.md")) return "guide";
    if (fileName.endsWith(".rules.md")) return "rule";

    // Path-based detection
    if (normalizedPath.match(/\/decisions\/adr\//)) return "adr";
    if (normalizedPath.match(/\/decisions\/rfc\//)) return "rfc";
    if (normalizedPath.match(/\/guides\//)) return "guide";
    if (normalizedPath.match(/\/rules\//)) return "rule";

    // Project detection
    if (fileName === "project.md" && normalizedPath.includes("/projects/")) return "project";
    if (normalizedPath.match(/\/projects\/[^\/]+\/[^\/]*\.md$/)) return "project";

    // Default fallback
    return "guide";
  }

  private extractProjectsArray(frontmatter: any, filePath: string): string[] {
    // Check frontmatter first
    if (frontmatter.related?.projects && Array.isArray(frontmatter.related.projects)) {
      return frontmatter.related.projects;
    }

    // Extract from path
    const projectMatch = filePath.match(/\/projects\/([^\/]+)/);
    if (projectMatch) {
      return [projectMatch[1]];
    }

    return [];
  }

  private validateRelatedMetadata(related: any): any {
    const validatedRelated: any = {};

    // Simple reference links
    const allowedKeys = ["adrs", "rfcs", "guides", "rules", "projects"];
    for (const key of allowedKeys) {
      if (related[key] && Array.isArray(related[key])) {
        validatedRelated[key] = related[key];
      }
    }

    // Directed graph links: depends-on
    if (related["depends-on"] && typeof related["depends-on"] === "object") {
      const dependsOn: any = {};
      for (const key of allowedKeys) {
        if (related["depends-on"][key] && Array.isArray(related["depends-on"][key])) {
          dependsOn[key] = related["depends-on"][key];
        }
      }
      if (Object.keys(dependsOn).length > 0) {
        validatedRelated["depends-on"] = dependsOn;
      }
    }

    // Directed graph links: supersedes
    if (related["supersedes"] && typeof related["supersedes"] === "object") {
      const supersedes: any = {};
      for (const key of allowedKeys) {
        if (related["supersedes"][key] && Array.isArray(related["supersedes"][key])) {
          supersedes[key] = related["supersedes"][key];
        }
      }
      if (Object.keys(supersedes).length > 0) {
        validatedRelated["supersedes"] = supersedes;
      }
    }

    return validatedRelated;
  }

  private extractTitle(frontmatter: any, filePath: string): string {
    // Priority: frontmatter.title > frontmatter.name > filename
    if (frontmatter.title && typeof frontmatter.title === "string") {
      return frontmatter.title;
    }
    if (frontmatter.name && typeof frontmatter.name === "string") {
      return frontmatter.name;
    }
    return path.basename(filePath, ".md");
  }

  private validateStatus(status: any, type: ProcessedDocument["metadata"]["type"]): string | undefined {
    if (!status || typeof status !== "string") {
      return undefined;
    }

    const validStatuses: Record<string, string[]> = {
      adr: ["draft", "accepted", "rejected", "deprecated", "superseded"],
      rfc: ["draft", "review", "accepted", "rejected", "implemented"],
      guide: [],
      rule: [],
      project: ["active", "inactive", "archived", "planning"],
    };

    const allowedStatuses = validStatuses[type] || [];
    if (allowedStatuses.length === 0) {
      return status;
    }

    return allowedStatuses.includes(status.toLowerCase()) ? status : undefined;
  }

  private generateDocumentId(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\//g, "_").replace(".md", "");
  }
}
