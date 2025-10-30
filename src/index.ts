#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import path from "path";
import { DocumentProcessor } from "./document-processor.js";
import { QdrantClient } from "./qdrant-client.js";
import { QueryResult } from "./query.js";
import packageJson from "../package.json";
import { createServer } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage } from "http";

const program = new Command();

const sseTransports: Record<string, SSEServerTransport> = {};

program.name("context1000").description("CLI for context1000 RAG system").version(packageJson.version);

program
  .command("index")
  .description("Index documents for RAG system")
  .argument("<docs-path>", "Path to documents directory")
  .action(async (docsPath: string) => {
    try {
      console.log("Starting document indexing...");

      const finalDocsPath = path.resolve(docsPath);
      console.log(`Processing documents from: ${finalDocsPath}`);

      const processor = new DocumentProcessor();
      const chunks = await processor.processDocumentsToChunks(finalDocsPath);

      console.log(`Processed ${chunks.length} document chunks`);

      if (chunks.length === 0) {
        console.log("No document chunks to index");
        return;
      }

      const qdrantClient = new QdrantClient();
      await qdrantClient.initialize("context1000");

      await qdrantClient.deleteCollection("context1000");
      await qdrantClient.initialize("context1000");

      await qdrantClient.addDocuments(chunks);

      const info = await qdrantClient.getCollectionInfo();
      console.log("Collection info:", info);

      console.log("Document indexing completed successfully!");

      console.log("\nIndexed document chunks:");
      const documentsMap = new Map<string, any[]>();
      chunks.forEach((chunk) => {
        const docId = chunk.metadata.filePath;
        if (!documentsMap.has(docId)) {
          documentsMap.set(docId, []);
        }
        documentsMap.get(docId)!.push(chunk);
      });

      documentsMap.forEach((chunks, filePath) => {
        const firstChunk = chunks[0];
        console.log(
          `- ${firstChunk.metadata.title} (${firstChunk.metadata.type}) - ${chunks.length} chunks - ${filePath}`
        );
      });
    } catch (error) {
      console.error("Error indexing documents:", error);
      process.exit(1);
    }
  });

program
  .command("mcp")
  .description("Start MCP server")
  .option("--transport <stdio|http|sse>", "transport type", "stdio")
  .option("--port <number>", "port for HTTP/SSE transport", "3000")
  .action(async (options) => {
    try {
      const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      const { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } = await import(
        "@modelcontextprotocol/sdk/types.js"
      );
      const { QueryInterface } = await import("./query.js");

      const transport = options.transport || "stdio";
      const port = parseInt(options.port) || 3000;

      const allowedTransports = ["stdio", "http", "sse"];
      if (!allowedTransports.includes(transport)) {
        console.error(`Invalid --transport value: '${transport}'. Must be one of: stdio, http, sse.`);
        process.exit(1);
      }

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

      let queryInterface: any = null;

      async function initializeRAG() {
        if (!queryInterface) {
          console.error("Initializing global RAG for context1000");

          queryInterface = new QueryInterface();
          await queryInterface.initialize("context1000");
        }
        return queryInterface;
      }

      server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
          tools: [
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
          ],
        };
      });

      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
          const rag = await initializeRAG();

          switch (name) {
            case "check_project_rules": {
              const { project, max_results = 15 } = args as any;

              const options: any = {
                maxResults: max_results,
                filterByType: ["rule"],
              };

              if (project) {
                options.filterByProject = [project];
              }

              let query = "rules constraints requirements standards";
              if (project) {
                query += ` ${project}`;
              }

              const results = await rag.queryDocs(query, options);

              const ruleReferences = results
                .map((result: QueryResult) => result.metadata.title || result.metadata.filePath)
                .filter((ref: string | undefined): ref is string => Boolean(ref));

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        rules: results,
                        rule_references: ruleReferences,
                        summary: `Found ${results.length} project rules${project ? ` for ${project}` : ""}`,
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            case "search_guides": {
              const { query, project, related_rules, max_results = 10 } = args as any;

              if (!query) {
                throw new McpError(ErrorCode.InvalidParams, "query is required");
              }

              const options: any = {
                maxResults: max_results,
                filterByType: ["guide"],
              };

              if (project) {
                options.filterByProject = [project];
              }

              let enhancedQuery = query;
              if (related_rules && related_rules.length > 0) {
                enhancedQuery += ` ${related_rules.join(" ")}`;
              }

              const results = await rag.queryDocs(enhancedQuery, options);

              const decisionReferences = results.reduce((refs: string[], result: QueryResult) => {
                const content = result.document.toLowerCase();
                const adrMatches = content.match(/adr[-_]?\d+/g) || [];
                const rfcMatches = content.match(/rfc[-_]?\d+/g) || [];
                return refs.concat(adrMatches, rfcMatches);
              }, [] as string[]);

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        guides: results,
                        decision_references: [...new Set(decisionReferences)],
                        summary: `Found ${results.length} implementation guides for "${query}"${
                          project ? ` in ${project}` : ""
                        }`,
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            case "search_decisions": {
              const { query, references, project, max_results = 8 } = args as any;

              if (!query) {
                throw new McpError(ErrorCode.InvalidParams, "query is required");
              }

              const options: any = {
                maxResults: max_results,
                filterByType: ["adr", "rfc"],
              };

              if (project) {
                options.filterByProject = [project];
              }

              let enhancedQuery = query;
              if (references && references.length > 0) {
                enhancedQuery += ` ${references.join(" ")}`;
              }

              const results = await rag.queryDocs(enhancedQuery, options);

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        decisions: results,
                        summary: `Found ${results.length} architectural decisions for "${query}"${
                          references ? ` (refs: ${references.join(", ")})` : ""
                        }`,
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            case "search_documentation": {
              const { query, project, type_filter, max_results = 10 } = args as any;

              if (!query) {
                throw new McpError(ErrorCode.InvalidParams, "query is required");
              }

              const options: any = {
                maxResults: max_results,
                filterByType: type_filter,
              };

              if (project) {
                options.filterByProject = [project];
              }

              const results = await rag.queryDocs(query, options);

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        documents: results,
                        summary: `Found ${results.length} documents for "${query}"${
                          type_filter ? ` (types: ${type_filter.join(", ")})` : ""
                        }`,
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }

            default:
              throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
          }
        } catch (error) {
          throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
        }
      });

      if (transport === "stdio") {
        const stderrTransport = new StdioServerTransport();
        await server.connect(stderrTransport);
        console.error("context1000 RAG MCP server running on stdio");
      } else if (transport === "http" || transport === "sse") {
        const initialPort = port;
        let actualPort = initialPort;
        const httpServer = createServer(async (req, res) => {
          const url = new URL(req.url || "", `http://${req.headers.host}`).pathname;

          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, MCP-Session-Id, mcp-session-id, MCP-Protocol-Version"
          );
          res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id");

          if (req.method === "OPTIONS") {
            res.writeHead(200);
            res.end();
            return;
          }

          try {
            if (url === "/mcp") {
              const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
              });
              await server.connect(transport);
              await transport.handleRequest(req, res);
            } else if (url === "/sse" && req.method === "GET") {
              const sseTransport = new SSEServerTransport("/messages", res);
              sseTransports[sseTransport.sessionId] = sseTransport;
              res.on("close", () => {
                delete sseTransports[sseTransport.sessionId];
              });
              await server.connect(sseTransport);
            } else if (url === "/messages" && req.method === "POST") {
              const sessionId =
                new URL(req.url || "", `http://${req.headers.host}`).searchParams.get("sessionId") ?? "";

              if (!sessionId) {
                res.writeHead(400);
                res.end("Missing sessionId parameter");
                return;
              }

              const sseTransport = sseTransports[sessionId];
              if (!sseTransport) {
                res.writeHead(400);
                res.end(`No transport found for sessionId: ${sessionId}`);
                return;
              }

              await sseTransport.handlePostMessage(req, res);
            } else if (url === "/ping") {
              res.writeHead(200, { "Content-Type": "text/plain" });
              res.end("pong");
            } else {
              res.writeHead(404);
              res.end("Not found");
            }
          } catch (error) {
            console.error("Error handling request:", error);
            if (!res.headersSent) {
              res.writeHead(500);
              res.end("Internal Server Error");
            }
          }
        });

        const startServer = (currentPort: number, maxAttempts = 10) => {
          httpServer.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE" && currentPort < initialPort + maxAttempts) {
              console.warn(`Port ${currentPort} is in use, trying port ${currentPort + 1}...`);
              startServer(currentPort + 1, maxAttempts);
            } else {
              console.error(`Failed to start server: ${err.message}`);
              process.exit(1);
            }
          });

          httpServer.listen(currentPort, () => {
            actualPort = currentPort;
            console.error(
              `context1000 RAG MCP Server running on ${transport.toUpperCase()} at http://localhost:${actualPort}/mcp and legacy SSE at /sse`
            );
          });
        };

        startServer(initialPort);
      } else {
        throw new Error(`Unsupported transport: ${transport}`);
      }
    } catch (error) {
      console.error("Failed to run MCP server:", error);
      process.exit(1);
    }
  });

program.parse();
