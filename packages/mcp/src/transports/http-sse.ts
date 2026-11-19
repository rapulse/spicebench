import http from "node:http";
import { URL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

export interface HttpSseServerOptions {
  port?: number;
  host?: string;
}

export interface HttpSseServerInstance {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

export async function startHttpSseTransport(
  mcpServer: McpServer,
  options: HttpSseServerOptions = {},
): Promise<HttpSseServerInstance> {
  const port = options.port ?? 3100;
  const host = options.host ?? "localhost";

  const activeTransports = new Map<string, SSEServerTransport>();

  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = parsedUrl.pathname;

    // Health / Discovery endpoint
    if (pathname === "/" || pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "SpiceBench MCP Server",
          version: "0.1.0",
          sseEndpoint: "/sse",
          messagesEndpoint: "/messages",
          activeSessions: activeTransports.size,
        }),
      );
      return;
    }

    // SSE connection endpoint
    if (pathname === "/sse" && req.method === "GET") {
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      activeTransports.set(sessionId, transport);

      transport.onclose = () => {
        activeTransports.delete(sessionId);
      };

      await mcpServer.connect(transport);
      return;
    }

    // Message POST endpoint
    if (pathname === "/messages" && req.method === "POST") {
      const sessionId = parsedUrl.searchParams.get("sessionId");
      if (!sessionId || !activeTransports.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Session not found");
        return;
      }

      const transport = activeTransports.get(sessionId)!;
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found");
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.once("error", reject);
  });

  const close = async (): Promise<void> => {
    for (const transport of activeTransports.values()) {
      try {
        await transport.close();
      } catch {
        // ignore
      }
    }
    activeTransports.clear();

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return {
    server,
    port,
    close,
  };
}
