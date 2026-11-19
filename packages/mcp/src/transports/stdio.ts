import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export async function startStdioTransport(server: McpServer): Promise<StdioServerTransport> {
  const transport = new StdioServerTransport();

  // Handle process signals
  const cleanup = async () => {
    try {
      await server.close();
      await transport.close();
    } catch {
      // Ignore errors on rapid termination
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await server.connect(transport);
  return transport;
}
