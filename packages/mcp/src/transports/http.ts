import http from "node:http";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

/**
 * Local HTTP transport for the MCP server (ADR-010).
 *
 * - `POST|GET|DELETE /mcp` — Streamable HTTP (current MCP spec), stateful sessions.
 * - `GET /sse` + `POST /messages?sessionId=` — legacy HTTP+SSE for older clients.
 * - `GET /health` — status JSON.
 *
 * Every client session gets its own McpServer instance (an McpServer can be bound to only one
 * transport); all instances share one CircuitSession through `createServer`.
 *
 * Security: listens on loopback only, rejects requests whose Host is not loopback
 * (DNS rebinding) and requests with a browser Origin that is not explicitly allowed
 * (other web pages must not drive the circuit). No wildcard CORS.
 */
export interface HttpTransportOptions {
  port?: number;
  /** Bind address. Default 127.0.0.1. Only loopback addresses are accepted. */
  host?: string;
  /**
   * Browser origins allowed to call the server (e.g. MCP Inspector "http://localhost:6274").
   * Requests without an Origin header (CLI/desktop MCP clients) are always allowed.
   * Default: loopback origins on any port.
   */
  allowedOrigins?: (origin: string) => boolean;
}

export interface HttpTransportInstance {
  server: http.Server;
  port: number;
  host: string;
  /** Streamable HTTP endpoint URL. */
  mcpUrl: string;
  /** Legacy SSE endpoint URL. */
  sseUrl: string;
  activeSessions: () => number;
  close: () => Promise<void>;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (u.protocol === "http:" || u.protocol === "https:") && LOOPBACK_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function hostHeaderIsLoopback(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  // "127.0.0.1:3100", "localhost:3100", "[::1]:3100"
  const hostname = hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : hostHeader.split(":")[0]!;
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function jsonRpcError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

async function readJsonBody(req: http.IncomingMessage, limitBytes = 4 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  return text.length > 0 ? JSON.parse(text) : undefined;
}

export async function startHttpTransport(
  createServer: () => McpServer,
  options: HttpTransportOptions = {},
): Promise<HttpTransportInstance> {
  const port = options.port ?? 3100;
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Refusing to bind MCP HTTP server to non-loopback address "${host}"`);
  }
  const originAllowed = options.allowedOrigins ?? isLoopbackOrigin;

  interface Session {
    transport: StreamableHTTPServerTransport | SSEServerTransport;
    server: McpServer;
  }
  const streamable = new Map<string, Session>();
  const legacy = new Map<string, Session>();

  const closeSession = async (s: Session): Promise<void> => {
    await s.transport.close().catch(() => undefined);
    await s.server.close().catch(() => undefined);
  };

  const httpServer = http.createServer(async (req, res) => {
    try {
      // --- Security gate (applies to every endpoint) ---
      if (!hostHeaderIsLoopback(req.headers.host)) {
        jsonRpcError(res, 403, "Forbidden: non-loopback Host header");
        return;
      }
      const origin = req.headers.origin;
      if (origin !== undefined) {
        if (!originAllowed(origin)) {
          jsonRpcError(res, 403, `Forbidden: origin ${origin} is not allowed`);
          return;
        }
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
        );
        res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (pathname === "/" || pathname === "/health") {
        sendJson(res, 200, {
          status: "ok",
          service: "SpiceBench MCP Server",
          version: "0.1.0",
          mcpEndpoint: "/mcp",
          legacySseEndpoint: "/sse",
          activeSessions: streamable.size + legacy.size,
        });
        return;
      }

      // --- Streamable HTTP ---
      if (pathname === "/mcp") {
        const sessionId = req.headers["mcp-session-id"];
        const sid = Array.isArray(sessionId) ? sessionId[0] : sessionId;

        if (sid) {
          const s = streamable.get(sid);
          if (!s) {
            jsonRpcError(res, 404, "Session not found");
            return;
          }
          const body = req.method === "POST" ? await readJsonBody(req) : undefined;
          await (s.transport as StreamableHTTPServerTransport).handleRequest(req, res, body);
          return;
        }

        if (req.method !== "POST") {
          jsonRpcError(res, 400, "Bad Request: missing Mcp-Session-Id");
          return;
        }
        const body = await readJsonBody(req);
        if (!isInitializeRequest(body)) {
          jsonRpcError(res, 400, "Bad Request: first request must be initialize");
          return;
        }

        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            streamable.set(id, { transport, server });
          },
        });
        transport.onclose = () => {
          const id = transport.sessionId;
          if (id && streamable.delete(id)) void server.close().catch(() => undefined);
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      // --- Legacy HTTP+SSE ---
      if (pathname === "/sse" && req.method === "GET") {
        const transport = new SSEServerTransport("/messages", res);
        const server = createServer();
        legacy.set(transport.sessionId, { transport, server });
        transport.onclose = () => {
          if (legacy.delete(transport.sessionId)) void server.close().catch(() => undefined);
        };
        await server.connect(transport);
        return;
      }
      if (pathname === "/messages" && req.method === "POST") {
        const sid = url.searchParams.get("sessionId");
        const s = sid ? legacy.get(sid) : undefined;
        if (!s) {
          jsonRpcError(res, 404, "Session not found");
          return;
        }
        await (s.transport as SSEServerTransport).handlePostMessage(req, res);
        return;
      }

      jsonRpcError(res, 404, "Not Found");
    } catch (err) {
      jsonRpcError(res, 500, `Internal error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  const urlHost = host.includes(":") ? `[${host}]` : host;

  return {
    server: httpServer,
    port: boundPort,
    host,
    mcpUrl: `http://${urlHost}:${boundPort}/mcp`,
    sseUrl: `http://${urlHost}:${boundPort}/sse`,
    activeSessions: () => streamable.size + legacy.size,
    close: async () => {
      const all = [...streamable.values(), ...legacy.values()];
      streamable.clear();
      legacy.clear();
      await Promise.all(all.map(closeSession));
      httpServer.closeAllConnections?.();
      await new Promise<void>((resolve, reject) => httpServer.close((e) => (e ? reject(e) : resolve())));
    },
  };
}
