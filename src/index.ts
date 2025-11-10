#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import packageJson from "../package.json";
import { runIndexer } from "./indexer.js";
import { runMcpServer } from "./mcp.js";

const program = new Command();

program.name("context1000").description("CLI for context1000 RAG system").version(packageJson.version);

program
  .command("index")
  .description("Index documents for RAG system")
  .argument("<docs-path>", "Path to documents directory")
  .action(async (docsPath: string) => {
    await runIndexer(docsPath);
  });

program
  .command("mcp")
  .description("Start MCP server")
  .option("--transport <stdio|http|sse>", "transport type", "stdio")
  .option("--port <number>", "port for HTTP/SSE transport", "3000")
  .action(async (options) => {
    await runMcpServer({
      transport: options.transport || "stdio",
      port: parseInt(options.port) || 3000,
    });
  });

program.parse();
