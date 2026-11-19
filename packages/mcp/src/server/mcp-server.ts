import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CircuitSession } from "../session/circuit-session";
import { registerTools } from "../tools/register-tools";

export interface McpServerConfig {
  name?: string;
  version?: string;
  session?: CircuitSession;
}

export interface SpiceBenchMcpInstance {
  server: McpServer;
  session: CircuitSession;
}

export function createSpiceBenchMcpServer(config: McpServerConfig = {}): SpiceBenchMcpInstance {
  const name = config.name ?? "spicebench-mcp";
  const version = config.version ?? "0.1.0";
  const session = config.session ?? new CircuitSession();

  const server = new McpServer({
    name,
    version,
  });

  // 1. Register Core Tools
  registerTools(server, session);

  // 2. Register Useful Resources
  server.resource(
    "current_circuit",
    "circuit://current",
    async (uri) => {
      const circuit = session.getCircuit();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(circuit, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "spice_netlist",
    "spice://netlist",
    async (uri) => {
      const netlist = session.exportSpice();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: netlist,
          },
        ],
      };
    },
  );

  return {
    server,
    session,
  };
}
