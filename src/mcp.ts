import "dotenv/config";
import { createServer, Server as HttpServer, IncomingMessage, ServerResponse } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { QueryInterface, QueryResult } from "./query.js";
import packageJson from "../package.json";
import { readFile } from "fs/promises";
import matter from "gray-matter";

const COLLECTION_NAME = "context1000";
const DEFAULT_PORT = 3000;
const MAX_PORT_RETRY = 10;

export interface McpServerOptions {
  transport: "stdio" | "http" | "sse";
  port?: number;
}

interface QueryOptions {
  maxResults: number;
  filterByType?: string[];
  filterByProject?: string[];
}

interface ToolArgs {
  query?: string;
  project?: string;
  max_results?: number;
  related_rules?: string[];
  references?: string[];
  type_filter?: string[];
  draft_title?: string;
  draft_type?: string;
  draft_summary?: string;
  min_similarity?: number;
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  include_content?: boolean;
  include_frontmatter?: boolean;
  include_raw?: boolean;
}

// Tool definitions extracted to constants for reusability
const TOOLS: Tool[] = [
  {
    name: "check_project_rules",
    description:
      "Check project rules and constraints. Should be called FIRST when working on any project task. Returns project-specific rules, coding standards, constraints, and requirements that must be followed.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project name to check rules for. If not provided, searches for general rules.",
        },
        max_results: {
          type: "number",
          description: "Maximum number of rule chunks to return (default: 15)",
          minimum: 1,
          maximum: 30,
        },
      },
      required: [],
    },
  },
  {
    name: "search_guides",
    description:
      "Search implementation guides and best practices based on project rules and decision context. Called AFTER check_project_rules when specific implementation guidance is needed. Finds step-by-step guides, patterns, examples, and references to architectural decisions (ADRs/RFCs) that inform implementation approaches.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Specific guidance needed (e.g., 'authentication implementation', 'testing patterns', 'deployment process')",
        },
        project: {
          type: "string",
          description: "Project name for project-specific guides",
        },
        related_rules: {
          type: "array",
          items: { type: "string" },
          description: "Rule references found from check_project_rules to find related guides",
        },
        max_results: {
          type: "number",
          description: "Maximum number of guide chunks to return (default: 10)",
          minimum: 1,
          maximum: 25,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_decisions",
    description:
      "Search through architectural decisions (ADRs) and RFCs. Triggered automatically when rules or guides reference specific decisions. Returns decision context, rationale, and implications.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Decision or RFC topic to search for",
        },
        references: {
          type: "array",
          items: { type: "string" },
          description: "Decision references found in rules or guides (e.g., 'ADR-001', 'RFC-123')",
        },
        project: {
          type: "string",
          description: "Project context for project-specific decisions",
        },
        max_results: {
          type: "number",
          description: "Maximum number of decision chunks to return (default: 8)",
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_documentation",
    description:
      "Fallback general documentation search. Use when specific tools (check_project_rules, check_guides, search_decisions) don't provide sufficient information. Searches across all document types.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query for finding relevant documentation",
        },
        project: {
          type: "string",
          description: "Optional project name to search within specific project documentation",
        },
        type_filter: {
          type: "array",
          items: {
            type: "string",
            enum: ["adr", "rfc", "guide", "rule", "project"],
          },
          description: "Filter results by document types",
        },
        max_results: {
          type: "number",
          description: "Maximum number of document chunks to return (default: 10)",
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "find_similar_documents",
    description:
      "Find existing documents similar to a proposed new or updated document to avoid duplicates and choose between update vs create.",
    inputSchema: {
      type: "object",
      properties: {
        draft_title: {
          type: "string",
          description: "Title or name of the proposed document (rule/ADR/guide/etc).",
        },
        draft_type: {
          type: "string",
          enum: ["rule", "guide", "adr", "rfc", "project", "other"],
          description: "Intended document type.",
        },
        draft_summary: {
          type: "string",
          description: "Short summary or key requirements/ideas of the proposed document.",
        },
        max_results: {
          type: "number",
          description: "Maximum number of similar documents to return (default: 5)",
          minimum: 1,
          maximum: 10,
        },
        min_similarity: {
          type: "number",
          description: "Optional similarity threshold (0-1). Below this, results should be considered unrelated.",
          minimum: 0,
          maximum: 1,
        },
      },
      required: ["draft_summary"],
    },
  },
  {
    name: "get_document",
    description:
      "Fetch a full canonical document by its stable identifier (id/name/slug) instead of chunks. Use this after search_* or find_similar_documents to read or update the actual source document (including frontmatter).",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Stable document identifier (preferred). Usually matches frontmatter 'name' or internal doc_id returned by other tools.",
        },
        name: {
          type: "string",
          description: "Frontmatter 'name' if used as canonical ID. Use if 'id' is not provided.",
        },
        slug: {
          type: "string",
          description: "Document slug (e.g. '/rules/all-apis-must-implement-rate-limiting.rule/'). Use as fallback if id/name unknown.",
        },
        type: {
          type: "string",
          enum: ["rule", "guide", "adr", "rfc", "project", "other"],
          description: "Optional document type to disambiguate when multiple docs share similar identifiers.",
        },
        include_content: {
          type: "boolean",
          description: "If true, returns full document content (Markdown body). Default: true.",
        },
        include_frontmatter: {
          type: "boolean",
          description: "If true, returns parsed frontmatter (name, title, tags, related, etc.). Default: true.",
        },
        include_raw: {
          type: "boolean",
          description: "If true, also returns raw source as-is (e.g. full markdown file text). Useful for precise edits. Default: false.",
        },
      },
    },
  },
];

// Utility functions
function buildQueryOptions(args: ToolArgs, filterByType: string[], defaultMaxResults: number): QueryOptions {
  const options: QueryOptions = {
    maxResults: args.max_results ?? defaultMaxResults,
    filterByType,
  };

  if (args.project) {
    options.filterByProject = [args.project];
  }

  return options;
}

function enhanceQueryWithContext(baseQuery: string, context?: string[]): string {
  if (!context?.length) return baseQuery;
  return `${baseQuery} ${context.join(" ")}`;
}

function extractDecisionReferences(results: QueryResult[]): string[] {
  const references = results.flatMap((result) => {
    const content = result.document.toLowerCase();
    const adrMatches = content.match(/adr[-_]?\d+/g) || [];
    const rfcMatches = content.match(/rfc[-_]?\d+/g) || [];
    return [...adrMatches, ...rfcMatches];
  });

  return [...new Set(references)];
}

function formatToolResponse(data: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// Tool handlers
async function handleCheckProjectRules(rag: QueryInterface, args: ToolArgs) {
  const options = buildQueryOptions(args, ["rule"], 15);
  const query = enhanceQueryWithContext("rules constraints requirements standards", args.project ? [args.project] : undefined);
  const results = await rag.queryDocs(query, options);

  const ruleReferences = results
    .map((result) => result.metadata.title || result.metadata.filePath)
    .filter((ref): ref is string => Boolean(ref));

  return formatToolResponse({
    rules: results,
    rule_references: ruleReferences,
    summary: `Found ${results.length} project rules${args.project ? ` for ${args.project}` : ""}`,
  });
}

async function handleSearchGuides(rag: QueryInterface, args: ToolArgs) {
  if (!args.query) {
    throw new McpError(ErrorCode.InvalidParams, "query is required");
  }

  const options = buildQueryOptions(args, ["guide"], 10);
  const enhancedQuery = enhanceQueryWithContext(args.query, args.related_rules);
  const results = await rag.queryDocs(enhancedQuery, options);

  return formatToolResponse({
    guides: results,
    decision_references: extractDecisionReferences(results),
    summary: `Found ${results.length} implementation guides for "${args.query}"${args.project ? ` in ${args.project}` : ""}`,
  });
}

async function handleSearchDecisions(rag: QueryInterface, args: ToolArgs) {
  if (!args.query) {
    throw new McpError(ErrorCode.InvalidParams, "query is required");
  }

  const options = buildQueryOptions(args, ["adr", "rfc"], 8);
  const enhancedQuery = enhanceQueryWithContext(args.query, args.references);
  const results = await rag.queryDocs(enhancedQuery, options);

  return formatToolResponse({
    decisions: results,
    summary: `Found ${results.length} architectural decisions for "${args.query}"${
      args.references?.length ? ` (refs: ${args.references.join(", ")})` : ""
    }`,
  });
}

async function handleSearchDocumentation(rag: QueryInterface, args: ToolArgs) {
  if (!args.query) {
    throw new McpError(ErrorCode.InvalidParams, "query is required");
  }

  const options: QueryOptions = {
    maxResults: args.max_results ?? 10,
    filterByType: args.type_filter,
  };

  if (args.project) {
    options.filterByProject = [args.project];
  }

  const results = await rag.queryDocs(args.query, options);

  return formatToolResponse({
    documents: results,
    summary: `Found ${results.length} documents for "${args.query}"${
      args.type_filter?.length ? ` (types: ${args.type_filter.join(", ")})` : ""
    }`,
  });
}

async function handleFindSimilarDocuments(rag: QueryInterface, args: ToolArgs) {
  if (!args.draft_summary) {
    throw new McpError(ErrorCode.InvalidParams, "draft_summary is required");
  }

  const queryParts = [];
  if (args.draft_title) {
    queryParts.push(args.draft_title);
  }
  queryParts.push(args.draft_summary);
  const query = queryParts.join(" ");

  const options: QueryOptions = {
    maxResults: args.max_results ?? 5,
  };

  if (args.draft_type && args.draft_type !== "other") {
    options.filterByType = [args.draft_type];
  }

  const results = await rag.queryDocs(query, options);

  const minSimilarity = args.min_similarity ?? 0.7;

  return formatToolResponse({
    similar_documents: results,
    found_count: results.length,
    min_similarity_threshold: minSimilarity,
    draft_info: {
      title: args.draft_title,
      type: args.draft_type,
      summary: args.draft_summary,
    },
    summary: `Found ${results.length} similar ${args.draft_type || "document"}${
      results.length !== 1 ? "s" : ""
    } for "${args.draft_title || args.draft_summary.substring(0, 50)}..."`,
    recommendation:
      results.length > 0
        ? "Review these documents to determine if update or new creation is needed"
        : "No similar documents found - safe to create new document",
  });
}

async function handleGetDocument(rag: QueryInterface, args: ToolArgs) {
  // Validate at least one identifier is provided
  if (!args.id && !args.name && !args.slug) {
    throw new McpError(ErrorCode.InvalidParams, "At least one of id, name, or slug is required");
  }

  // Build query to find the document
  const searchTerms = [args.id, args.name, args.slug].filter((term): term is string => Boolean(term));
  const query = searchTerms.join(" ");

  // Search for the document
  const options: QueryOptions = {
    maxResults: 5,
  };

  if (args.type && args.type !== "other") {
    options.filterByType = [args.type];
  }

  const results = await rag.queryDocs(query, options);

  if (results.length === 0) {
    throw new McpError(ErrorCode.InvalidRequest, `No document found matching: ${query}`);
  }

  // Get the best match (first result)
  const document = results[0];
  const filePath = document.metadata.filePath;

  if (!filePath) {
    throw new McpError(ErrorCode.InternalError, "Document has no associated file path");
  }

  // Read the file from disk
  let fileContent: string;
  try {
    fileContent = await readFile(filePath, "utf-8");
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to read file at ${filePath}: ${error}`);
  }

  // Parse frontmatter and content
  const parsed = matter(fileContent);

  // Prepare response based on include flags
  const includeContent = args.include_content !== false;
  const includeFrontmatter = args.include_frontmatter !== false;
  const includeRaw = args.include_raw === true;

  const response: Record<string, unknown> = {
    identifier: {
      id: args.id,
      name: args.name || parsed.data.name,
      slug: args.slug,
    },
    file_path: filePath,
    document_type: document.metadata.type,
  };

  if (includeFrontmatter) {
    response.frontmatter = parsed.data;
  }

  if (includeContent) {
    response.content = parsed.content;
  }

  if (includeRaw) {
    response.raw = fileContent;
  }

  response.metadata = {
    title: document.metadata.title,
    projects: document.metadata.projects,
    tags: document.metadata.tags,
    status: document.metadata.status,
  };

  return formatToolResponse(response);
}

// HTTP routing helpers
function setCORSHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Session-Id, mcp-session-id, MCP-Protocol-Version");
  res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id");
}

function respondWithError(res: ServerResponse, statusCode: number, message: string): void {
  if (!res.headersSent) {
    res.writeHead(statusCode);
    res.end(message);
  }
}

// SSE transport manager
class SSETransportManager {
  private transports = new Map<string, SSEServerTransport>();

  add(sessionId: string, transport: SSEServerTransport): void {
    this.transports.set(sessionId, transport);
  }

  get(sessionId: string): SSEServerTransport | undefined {
    return this.transports.get(sessionId);
  }

  remove(sessionId: string): void {
    this.transports.delete(sessionId);
  }

  cleanup(): void {
    this.transports.clear();
  }
}

// HTTP request router
class HTTPRouter {
  constructor(
    private server: Server,
    private sseManager: SSETransportManager
  ) {}

  async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "", `http://${req.headers.host}`).pathname;

    switch (url) {
      case "/mcp":
        await this.handleMCP(req, res);
        break;
      case "/sse":
        await this.handleSSE(req, res);
        break;
      case "/messages":
        await this.handleMessages(req, res);
        break;
      case "/ping":
        this.handlePing(res);
        break;
      default:
        respondWithError(res, 404, "Not found");
    }
  }

  private async handleMCP(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await this.server.connect(transport);
    await transport.handleRequest(req, res);
  }

  private async handleSSE(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "GET") {
      respondWithError(res, 405, "Method not allowed");
      return;
    }

    const sseTransport = new SSEServerTransport("/messages", res);
    this.sseManager.add(sseTransport.sessionId, sseTransport);

    res.on("close", () => {
      this.sseManager.remove(sseTransport.sessionId);
    });

    await this.server.connect(sseTransport);
  }

  private async handleMessages(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      respondWithError(res, 405, "Method not allowed");
      return;
    }

    const sessionId = new URL(req.url || "", `http://${req.headers.host}`).searchParams.get("sessionId");

    if (!sessionId) {
      respondWithError(res, 400, "Missing sessionId parameter");
      return;
    }

    const sseTransport = this.sseManager.get(sessionId);
    if (!sseTransport) {
      respondWithError(res, 400, `No transport found for sessionId: ${sessionId}`);
      return;
    }

    await sseTransport.handlePostMessage(req, res);
  }

  private handlePing(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("pong");
  }
}

// Port finder with retry
async function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;

    const tryPort = () => {
      const testServer = createServer();

      testServer.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && currentPort < startPort + MAX_PORT_RETRY) {
          console.warn(`Port ${currentPort} is in use, trying port ${currentPort + 1}...`);
          currentPort++;
          tryPort();
        } else {
          reject(new Error(`Failed to find available port: ${err.message}`));
        }
      });

      testServer.once("listening", () => {
        testServer.close(() => resolve(currentPort));
      });

      testServer.listen(currentPort);
    };

    tryPort();
  });
}

// Main server setup
async function setupMCPServer(): Promise<Server> {
  const server = new Server(
    {
      name: "context1000",
      version: packageJson.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  let queryInterface: QueryInterface | null = null;

  async function getRAG(): Promise<QueryInterface> {
    if (!queryInterface) {
      console.error("Initializing global RAG for context1000");
      queryInterface = new QueryInterface();
      await queryInterface.initialize(COLLECTION_NAME);
    }
    return queryInterface;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const rag = await getRAG();

    try {
      switch (name) {
        case "check_project_rules":
          return await handleCheckProjectRules(rag, args as ToolArgs);
        case "search_guides":
          return await handleSearchGuides(rag, args as ToolArgs);
        case "search_decisions":
          return await handleSearchDecisions(rag, args as ToolArgs);
        case "search_documentation":
          return await handleSearchDocumentation(rag, args as ToolArgs);
        case "find_similar_documents":
          return await handleFindSimilarDocuments(rag, args as ToolArgs);
        case "get_document":
          return await handleGetDocument(rag, args as ToolArgs);
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
    }
  });

  return server;
}

async function startStdioServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("context1000 RAG MCP server running on stdio");
}

async function startHTTPServer(server: Server, transport: string, port: number): Promise<HttpServer> {
  const actualPort = await findAvailablePort(port);
  const sseManager = new SSETransportManager();
  const router = new HTTPRouter(server, sseManager);

  const httpServer = createServer(async (req, res) => {
    setCORSHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      await router.route(req, res);
    } catch (error) {
      console.error("Error handling request:", error);
      respondWithError(res, 500, "Internal Server Error");
    }
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(actualPort, () => {
      console.error(
        `context1000 RAG MCP Server running on ${transport.toUpperCase()} at http://localhost:${actualPort}/mcp and legacy SSE at /sse`
      );
      resolve(httpServer);
    });
  });
}

export async function runMcpServer(options: McpServerOptions): Promise<void> {
  const server = await setupMCPServer();
  const port = options.port ?? DEFAULT_PORT;

  if (options.transport === "stdio") {
    await startStdioServer(server);
  } else {
    await startHTTPServer(server, options.transport, port);
  }
}
