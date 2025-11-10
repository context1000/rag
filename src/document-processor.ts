import "dotenv/config";

import fs from "fs-extra";
import path from "path";
import matter from "gray-matter";

export type DocumentType = "adr" | "rfc" | "guide" | "rule" | "project";

export interface RelatedMetadata {
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
}

export interface BaseMetadata {
  title: string;
  type: DocumentType;
  tags: string[];
  projects: string[];
  status?: string;
  filePath: string;
  related?: RelatedMetadata;
}

export interface ChunkMetadata extends BaseMetadata {
  chunkIndex: number;
  totalChunks: number;
  sectionType?: string;
  sectionTitle?: string;
  tokens: number;
}

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
}

export interface ProcessedDocument {
  id: string;
  content: string;
  chunks: DocumentChunk[];
  metadata: BaseMetadata;
}

interface Section {
  title: string;
  content: string;
  type: string;
}

// Section type mapping for cleaner inference
const SECTION_TYPE_PATTERNS: Record<string, RegExp> = {
  context: /(context|problem|background|motivation|rationale|why)/i,
  decision: /(decision|solution|approach|proposal|chosen)/i,
  consequences: /(consequence|impact|tradeoff|implication|effect)/i,
  alternatives: /(alternative|option|considered|comparison|rejected)/i,
  implementation: /(implementation|plan|rollout|migration|deploy|schedule)/i,
  summary: /(summary|overview|tldr|abstract|intro)/i,
  metrics: /(metric|measure|success|criteria|kpi)/i,
  risks: /(risk|concern|question|issue|challenge)/i,
};

const VALID_STATUSES: Record<DocumentType, string[]> = {
  adr: ["draft", "accepted", "rejected", "deprecated", "superseded"],
  rfc: ["draft", "review", "accepted", "rejected", "implemented"],
  guide: [],
  rule: [],
  project: ["active", "inactive", "archived", "planning"],
};

const RELATED_KEYS = ["adrs", "rfcs", "guides", "rules", "projects"] as const;
const SENTENCE_SPLIT_REGEX = /[^.!?\n]+(?:[.!?](?![\s\n])|[.!?](?=[\s\n](?:[A-Z]|$)))/g;

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
    return documents.flatMap((doc) => doc.chunks);
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

    const type = this.inferDocumentType(filePath);
    const id = this.generateDocumentId(filePath);

    const baseMetadata: BaseMetadata = {
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

  private createDocumentChunks(documentId: string, content: string, baseMetadata: BaseMetadata): DocumentChunk[] {
    const sections = this.extractSections(content);
    const chunks: DocumentChunk[] = [];

    let chunkIndex = 0;
    for (const section of sections) {
      const sectionChunks = this.chunkSection(section, documentId, chunkIndex, baseMetadata);
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }

    // Update totalChunks for all chunks
    const totalChunks = chunks.length;
    return chunks.map((chunk) => ({
      ...chunk,
      metadata: { ...chunk.metadata, totalChunks },
    }));
  }

  private extractSections(content: string): Section[] {
    const sections: Section[] = [];
    const lines = content.split("\n");
    let currentSection: Section = { title: "", content: "", type: "content" };

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }

        const title = headingMatch[2];
        currentSection = {
          title,
          content: line + "\n",
          type: this.inferSectionType(title),
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

    for (const [type, pattern] of Object.entries(SECTION_TYPE_PATTERNS)) {
      if (pattern.test(lower)) {
        return type;
      }
    }

    return "content";
  }

  private chunkSection(
    section: Section,
    documentId: string,
    startIndex: number,
    baseMetadata: BaseMetadata
  ): DocumentChunk[] {
    const tokens = this.estimateTokens(section.content);

    // If section fits in one chunk, return it
    if (tokens <= this.MAX_CHUNK_TOKENS) {
      return [this.createChunk(documentId, startIndex, section, baseMetadata, section.content)];
    }

    // Split large sections using sentence-aware strategy
    return this.splitLargeSectionSentenceAware(section, documentId, startIndex, baseMetadata);
  }

  private createChunk(
    documentId: string,
    chunkIndex: number,
    section: Section,
    baseMetadata: BaseMetadata,
    content: string
  ): DocumentChunk {
    const contentWithContext = this.addDocumentContext(content, baseMetadata.title, section.title);

    return {
      id: `${documentId}_chunk_${chunkIndex}`,
      content: contentWithContext,
      metadata: {
        ...baseMetadata,
        chunkIndex,
        totalChunks: 0, // Updated later
        sectionType: section.type,
        sectionTitle: section.title,
        tokens: this.estimateTokens(contentWithContext),
      },
    };
  }

  private addDocumentContext(content: string, documentTitle: string, sectionTitle: string): string {
    // Add document title for context
    // Section title is already in the content (extracted with the heading)
    // This helps the LLM understand what document the chunk belongs to
    return `# ${documentTitle}\n\n${content.trim()}`;
  }

  private splitLargeSectionSentenceAware(
    section: Section,
    documentId: string,
    startIndex: number,
    baseMetadata: BaseMetadata
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const sentences = this.splitIntoSentences(section.content);

    let currentChunk = "";
    let currentIndex = startIndex;

    for (const sentence of sentences) {
      const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      const testTokens = this.estimateTokens(testChunk);

      if (testTokens > this.MAX_CHUNK_TOKENS && currentChunk) {
        // Save current chunk
        chunks.push(this.createChunk(documentId, currentIndex, section, baseMetadata, currentChunk));

        // Start new chunk with overlap
        const overlapText = this.getLastNTokensOfText(currentChunk, this.OVERLAP_TOKENS);
        currentChunk = `${overlapText} ${sentence}`;
        currentIndex++;
      } else {
        currentChunk = testChunk;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(documentId, currentIndex, section, baseMetadata, currentChunk));
    }

    return chunks;
  }

  private splitIntoSentences(text: string): string[] {
    const sentences = text.match(SENTENCE_SPLIT_REGEX) || [text];
    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  private getLastNTokensOfText(text: string, maxTokens: number): string {
    const sentences = this.splitIntoSentences(text);
    let result = "";
    let tokens = 0;

    // Add sentences from the end until we reach maxTokens
    for (let i = sentences.length - 1; i >= 0 && tokens < maxTokens; i--) {
      const testResult = `${sentences[i]} ${result}`;
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

  private inferDocumentType(filePath: string): DocumentType {
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

  private extractProjectsArray(frontmatter: Record<string, unknown>, filePath: string): string[] {
    // Check frontmatter first
    const relatedProjects = (frontmatter.related as RelatedMetadata | undefined)?.projects;
    if (Array.isArray(relatedProjects)) {
      return relatedProjects;
    }

    // Extract from path
    const projectMatch = filePath.match(/\/projects\/([^\/]+)/);
    return projectMatch ? [projectMatch[1]] : [];
  }

  private validateRelatedMetadata(related: unknown): RelatedMetadata | undefined {
    if (!related || typeof related !== "object") {
      return undefined;
    }

    const relatedObj = related as Record<string, unknown>;
    const validated: RelatedMetadata = {};

    // Validate simple reference links
    for (const key of RELATED_KEYS) {
      const value = relatedObj[key];
      if (Array.isArray(value)) {
        validated[key] = value;
      }
    }

    // Validate directed graph links: depends-on
    validated["depends-on"] = this.validateDirectedLinks(relatedObj["depends-on"]);

    // Validate directed graph links: supersedes
    validated.supersedes = this.validateDirectedLinks(relatedObj["supersedes"]);

    return Object.keys(validated).length > 0 ? validated : undefined;
  }

  private validateDirectedLinks(
    links: unknown
  ): RelatedMetadata["depends-on"] | RelatedMetadata["supersedes"] | undefined {
    if (!links || typeof links !== "object") {
      return undefined;
    }

    const linksObj = links as Record<string, unknown>;
    const validated: Record<string, string[]> = {};

    for (const key of RELATED_KEYS) {
      const value = linksObj[key];
      if (Array.isArray(value)) {
        validated[key] = value;
      }
    }

    return Object.keys(validated).length > 0 ? validated : undefined;
  }

  private extractTitle(frontmatter: Record<string, unknown>, filePath: string): string {
    // Priority: frontmatter.title > frontmatter.name > filename
    if (typeof frontmatter.title === "string") {
      return frontmatter.title;
    }
    if (typeof frontmatter.name === "string") {
      return frontmatter.name;
    }
    return path.basename(filePath, ".md");
  }

  private validateStatus(status: unknown, type: DocumentType): string | undefined {
    if (!status || typeof status !== "string") {
      return undefined;
    }

    const allowedStatuses = VALID_STATUSES[type];
    if (allowedStatuses.length === 0) {
      return status;
    }

    return allowedStatuses.includes(status.toLowerCase()) ? status : undefined;
  }

  private generateDocumentId(filePath: string): string {
    return path.relative(process.cwd(), filePath).replace(/\//g, "_").replace(".md", "");
  }
}
