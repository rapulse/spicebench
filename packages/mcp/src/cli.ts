#!/usr/bin/env node
import { createSpiceBenchMcpServer } from "./server/mcp-server";
import { startStdioTransport } from "./transports/stdio";
import { startHttpSseTransport } from "./transports/http-sse";

async function main() {
  const args = process.argv.slice(2);
  let transportMode = "stdio";
  let port = 3100;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--transport" && args[i + 1]) {
      transportMode = args[i + 1]!;
      i++;
    } else if (arg === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1]!, 10);
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
SpiceBench MCP Server — Electronics Workbench Simulation for AI Agents

Usage:
  spicebench-mcp [options]

Options:
  --transport <stdio|http>   Transport mode to use (default: stdio)
  --port <number>            Port for HTTP/SSE transport (default: 3100)
  --help, -h                 Show this help message
`);
      process.exit(0);
    }
  }

  const { server } = createSpiceBenchMcpServer();

  if (transportMode === "http") {
    const instance = await startHttpSseTransport(server, { port });
    console.error(`[SpiceBench MCP] HTTP/SSE Server running on http://localhost:${instance.port}/sse`);
  } else {
    await startStdioTransport(server);
    // In stdio mode, logs must go to stderr so they don't corrupt JSON-RPC on stdout
    console.error("[SpiceBench MCP] Stdio Transport active and ready.");
  }
}

main().catch((err) => {
  console.error("[SpiceBench MCP Fatal Error]:", err);
  process.exit(1);
});
