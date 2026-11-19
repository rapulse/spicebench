import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import http from "node:http";
import {
  createSpiceBenchMcpServer,
  startHttpTransport,
  CircuitSession,
} from "../src/index";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

describe("Phase 3: Autonomous MCP Server & Tools Integration", () => {
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;
  let session: CircuitSession;

  beforeEach(async () => {
    session = new CircuitSession();
    const instance = createSpiceBenchMcpServer({ session });

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: "test-ai-client", version: "1.0.0" },
      { capabilities: {} },
    );

    // Connect server and client
    await Promise.all([
      instance.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    try {
      await client.close();
      await clientTransport.close();
      await serverTransport.close();
    } catch {
      // ignore
    }
  });

  it("lists all required 8 MCP tools plus helper tools", async () => {
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);

    expect(toolNames).toContain("get_circuit_state");
    expect(toolNames).toContain("place_component");
    expect(toolNames).toContain("update_component");
    expect(toolNames).toContain("remove_component");
    expect(toolNames).toContain("connect_pins");
    expect(toolNames).toContain("validate_circuit");
    expect(toolNames).toContain("run_simulation");
    expect(toolNames).toContain("read_instrument");
    expect(toolNames).toContain("export_spice");
    expect(toolNames).toContain("reset_circuit");
  });

  it("End-to-End Scenario: assemble voltage divider -> validate -> simulate -> read voltages", async () => {
    // 1. Place DC Voltage Source (10V) at (10, 10)
    const placeV1 = await client.callTool({
      name: "place_component",
      arguments: {
        type: "DC_VOLTAGE_SOURCE",
        id: "V1",
        params: { voltage: "10V" },
        x: 10,
        y: 10,
      },
    });
    expect(placeV1.isError).toBeFalsy();
    const v1Res = JSON.parse((placeV1.content[0] as { text: string }).text);
    expect(v1Res.ok).toBe(true);
    expect(v1Res.data.component.id).toBe("V1");

    // 2. Place R1 (10k) at (20, 10)
    const placeR1 = await client.callTool({
      name: "place_component",
      arguments: {
        type: "RESISTOR",
        id: "R1",
        params: { resistance: "10k" },
        x: 20,
        y: 10,
      },
    });
    expect(placeR1.isError).toBeFalsy();

    // 3. Place R2 (10k) at (20, 20)
    const placeR2 = await client.callTool({
      name: "place_component",
      arguments: {
        type: "RESISTOR",
        id: "R2",
        params: { resistance: "10k" },
        x: 20,
        y: 20,
      },
    });
    expect(placeR2.isError).toBeFalsy();

    // 4. Place Ground at (10, 20)
    const placeGnd = await client.callTool({
      name: "place_component",
      arguments: {
        type: "GROUND",
        id: "GND1",
        x: 10,
        y: 20,
      },
    });
    expect(placeGnd.isError).toBeFalsy();

    // 5. Connect V1:pos -> R1:1
    const conn1 = await client.callTool({
      name: "connect_pins",
      arguments: {
        fromComponentId: "V1",
        fromPinId: "pos",
        toComponentId: "R1",
        toPinId: "1",
      },
    });
    expect(conn1.isError).toBeFalsy();

    // 6. Connect R1:2 -> R2:1
    const conn2 = await client.callTool({
      name: "connect_pins",
      arguments: {
        fromComponentId: "R1",
        fromPinId: "2",
        toComponentId: "R2",
        toPinId: "1",
      },
    });
    expect(conn2.isError).toBeFalsy();

    // 7. Connect R2:2 -> GND1:0
    const conn3 = await client.callTool({
      name: "connect_pins",
      arguments: {
        fromComponentId: "R2",
        fromPinId: "2",
        toComponentId: "GND1",
        toPinId: "0",
      },
    });
    expect(conn3.isError).toBeFalsy();

    // 8. Connect V1:neg -> GND1:0
    const conn4 = await client.callTool({
      name: "connect_pins",
      arguments: {
        fromComponentId: "V1",
        fromPinId: "neg",
        toComponentId: "GND1",
        toPinId: "0",
      },
    });
    expect(conn4.isError).toBeFalsy();

    // 9. Validate Circuit Topology
    const valRes = await client.callTool({
      name: "validate_circuit",
      arguments: {},
    });
    expect(valRes.isError).toBeFalsy();
    const valParsed = JSON.parse((valRes.content[0] as { text: string }).text);
    expect(valParsed.ok).toBe(true);
    expect(valParsed.data.isValid).toBe(true);
    expect(valParsed.data.errorCount).toBe(0);

    // 10. Run OP Simulation
    const simRes = await client.callTool({
      name: "run_simulation",
      arguments: { mode: "op" },
    });
    expect(simRes.isError).toBeFalsy();
    const simParsed = JSON.parse((simRes.content[0] as { text: string }).text);
    expect(simParsed.ok).toBe(true);
    expect(simParsed.data.mode).toBe("op");

    // Verify exact analytical voltages
    // Midpoint node (R1:2 or R2:1) must be 5.000V
    expect(simParsed.data.pinVoltages["R1:2"]).toBeCloseTo(5.0, 3);
    expect(simParsed.data.pinVoltages["R2:1"]).toBeCloseTo(5.0, 3);
    // Input node (V1:pos or R1:1) must be 10.000V
    expect(simParsed.data.pinVoltages["V1:pos"]).toBeCloseTo(10.0, 3);
    expect(simParsed.data.pinVoltages["R1:1"]).toBeCloseTo(10.0, 3);
    // Ground node must be 0V
    expect(simParsed.data.pinVoltages["GND1:0"]).toBeCloseTo(0.0, 3);

    // 11. Read Circuit State
    const stateRes = await client.callTool({
      name: "get_circuit_state",
      arguments: { includeNetlist: true },
    });
    const stateParsed = JSON.parse((stateRes.content[0] as { text: string }).text);
    expect(stateParsed.ok).toBe(true);
    expect(stateParsed.data.stats.componentCount).toBe(4);
    expect(stateParsed.data.stats.wireCount).toBe(4);
    expect(stateParsed.data.netlist).toContain("R_R1");
    expect(stateParsed.data.netlist).toContain(".op");

    // 12. Modify R2 to 30k -> re-simulate -> midpoint should become 7.500V (30k / 40k * 10V)
    const updateR2 = await client.callTool({
      name: "update_component",
      arguments: {
        id: "R2",
        params: { resistance: "30k" },
      },
    });
    expect(updateR2.isError).toBeFalsy();

    const simRes2 = await client.callTool({
      name: "run_simulation",
      arguments: { mode: "op" },
    });
    const simParsed2 = JSON.parse((simRes2.content[0] as { text: string }).text);
    expect(simParsed2.data.pinVoltages["R1:2"]).toBeCloseTo(7.5, 3);

    // 13. Place a Multimeter across R2 to test read_instrument
    await client.callTool({
      name: "place_component",
      arguments: {
        type: "MULTIMETER",
        id: "XMM1",
        params: { mode: "V" },
        x: 30,
        y: 15,
      },
    });
    // Connect XMM1:pos to R1:2, and XMM1:neg to GND1:0
    await client.callTool({
      name: "connect_pins",
      arguments: {
        fromComponentId: "XMM1",
        fromPinId: "pos",
        toComponentId: "R1",
        toPinId: "2",
      },
    });
    await client.callTool({
      name: "connect_pins",
      arguments: {
        fromComponentId: "XMM1",
        fromPinId: "neg",
        toComponentId: "GND1",
        toPinId: "0",
      },
    });

    const meterRes = await client.callTool({
      name: "read_instrument",
      arguments: { instrumentId: "XMM1" },
    });
    expect(meterRes.isError).toBeFalsy();
    const meterParsed = JSON.parse((meterRes.content[0] as { text: string }).text);
    expect(meterParsed.ok).toBe(true);
    expect(meterParsed.data.type).toBe("MULTIMETER");
    expect(meterParsed.data.readings.value).toBeCloseTo(7.494, 2);
    expect(meterParsed.data.formatted).toContain("7.49");

    // 14. Remove component R2
    const removeRes = await client.callTool({
      name: "remove_component",
      arguments: { id: "R2" },
    });
    expect(removeRes.isError).toBeFalsy();
    const removeParsed = JSON.parse((removeRes.content[0] as { text: string }).text);
    expect(removeParsed.ok).toBe(true);
    expect(removeParsed.data.removedComponentId).toBe("R2");
  });

  it("handles validation and simulation errors with clear structured diagnostic responses", async () => {
    // Malformed circuit: Voltage source in a short-circuit loop without resistance
    await client.callTool({
      name: "place_component",
      arguments: { type: "DC_VOLTAGE_SOURCE", id: "V_BAD", x: 10, y: 10 },
    });
    await client.callTool({
      name: "place_component",
      arguments: { type: "GROUND", id: "GND_BAD", x: 10, y: 20 },
    });
    // Short circuit V_BAD pos directly to neg through ground
    await client.callTool({
      name: "connect_pins",
      arguments: {
        fromComponentId: "V_BAD",
        fromPinId: "pos",
        toComponentId: "GND_BAD",
        toPinId: "0",
      },
    });
    await client.callTool({
      name: "connect_pins",
      arguments: {
        fromComponentId: "V_BAD",
        fromPinId: "neg",
        toComponentId: "GND_BAD",
        toPinId: "0",
      },
    });

    const valRes = await client.callTool({
      name: "validate_circuit",
      arguments: {},
    });
    const valParsed = JSON.parse((valRes.content[0] as { text: string }).text);
    expect(valParsed.ok).toBe(true);
    expect(valParsed.data.isValid).toBe(false);
    expect(valParsed.data.errors.length).toBeGreaterThan(0);
    expect(valParsed.data.errors[0].code).toBe("VOLTAGE_SOURCE_LOOP");

    // Running simulation should safely reject with error message
    const simRes = await client.callTool({
      name: "run_simulation",
      arguments: { mode: "op" },
    });
    const simParsed = JSON.parse((simRes.content[0] as { text: string }).text);
    expect(simParsed.ok).toBe(false);
    expect(simParsed.error.message).toContain("VOLTAGE_SOURCE_LOOP");
  });

  it("serves /health on loopback", async () => {
    const shared = new CircuitSession();
    const httpInstance = await startHttpTransport(() => createSpiceBenchMcpServer({ session: shared }).server, {
      port: 0,
    });
    try {
      const res = await rawRequest(httpInstance.port, "GET", "/health");
      expect(res.status).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe("ok");
      expect(json.service).toBe("SpiceBench MCP Server");
      expect(json.mcpEndpoint).toBe("/mcp");
    } finally {
      await httpInstance.close();
      await shared.dispose();
    }
  });
});

function rawRequest(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("ADR-010: HTTP transport (Streamable HTTP + legacy SSE, loopback security)", () => {
  const initBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } },
  });
  const mcpHeaders = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

  it("two Streamable HTTP clients and one legacy SSE client share one circuit", async () => {
    const shared = new CircuitSession();
    const httpInstance = await startHttpTransport(() => createSpiceBenchMcpServer({ session: shared }).server, {
      port: 0,
    });
    const a = new Client({ name: "agent-a", version: "1" });
    const b = new Client({ name: "agent-b", version: "1" });
    const c = new Client({ name: "agent-legacy", version: "1" });
    try {
      await a.connect(new StreamableHTTPClientTransport(new URL(httpInstance.mcpUrl)));
      await b.connect(new StreamableHTTPClientTransport(new URL(httpInstance.mcpUrl)));
      await c.connect(new SSEClientTransport(new URL(httpInstance.sseUrl)));
      expect(httpInstance.activeSessions()).toBe(3);

      await a.callTool({ name: "place_component", arguments: { type: "RESISTOR", id: "R7", x: 1, y: 1 } });
      for (const client of [b, c]) {
        const state = await client.callTool({ name: "get_circuit_state", arguments: {} });
        const text = (state.content as Array<{ text: string }>)[0]!.text;
        expect(text).toContain("R7");
      }
      // Client A still works after B and C connected (old single-McpServer bug)
      const tools = await a.listTools();
      expect(tools.tools.length).toBeGreaterThan(5);
    } finally {
      await Promise.allSettled([a.close(), b.close(), c.close()]);
      await httpInstance.close();
      await shared.dispose();
    }
  });

  it("rejects foreign browser Origin and non-loopback Host (DNS rebinding); no wildcard CORS", async () => {
    const shared = new CircuitSession();
    const httpInstance = await startHttpTransport(() => createSpiceBenchMcpServer({ session: shared }).server, {
      port: 0,
    });
    try {
      const evil = await rawRequest(httpInstance.port, "POST", "/mcp", { ...mcpHeaders, Origin: "https://evil.example" }, initBody);
      expect(evil.status).toBe(403);

      const rebind = await rawRequest(httpInstance.port, "POST", "/mcp", { ...mcpHeaders, Host: "evil.example:3100" }, initBody);
      expect(rebind.status).toBe(403);

      const sse = await rawRequest(httpInstance.port, "GET", "/health", { Origin: "https://evil.example" });
      expect(sse.status).toBe(403);

      // Loopback origin (e.g. MCP Inspector) is allowed and gets its own origin echoed, not "*"
      const ok = await new Promise<{ status: number; acao?: string }>((resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port: httpInstance.port, method: "OPTIONS", path: "/mcp", headers: { Origin: "http://localhost:6274" } },
          (res) => {
            res.resume();
            resolve({ status: res.statusCode ?? 0, acao: res.headers["access-control-allow-origin"] as string });
          },
        );
        req.on("error", reject);
        req.end();
      });
      expect(ok.status).toBe(204);
      expect(ok.acao).toBe("http://localhost:6274");

      // Non-initialize request without session -> 400
      const noSession = await rawRequest(
        httpInstance.port,
        "POST",
        "/mcp",
        mcpHeaders,
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      );
      expect(noSession.status).toBe(400);
    } finally {
      await httpInstance.close();
      await shared.dispose();
    }
  });

  it("refuses to bind to a non-loopback address", async () => {
    await expect(
      startHttpTransport(() => createSpiceBenchMcpServer().server, { port: 0, host: "0.0.0.0" }),
    ).rejects.toThrow(/non-loopback/);
  });
});

describe("ADR-011: session results for agents", () => {
  it("maps ngspice errors to circuit component ids and keeps rawResult out of run_simulation", async () => {
    const session = new CircuitSession();
    const { server } = createSpiceBenchMcpServer({ session });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "1" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    try {
      const call = async (name: string, args: Record<string, unknown>) => {
        const r = await client.callTool({ name, arguments: args });
        return JSON.parse((r.content as Array<{ text: string }>)[0]!.text);
      };
      await call("place_component", { type: "DC_VOLTAGE_SOURCE", id: "V1", x: 0, y: 0, params: { voltage: "5V" } });
      await call("place_component", { type: "RESISTOR", id: "R1", x: 5, y: 0, params: { resistance: "1k" } });
      await call("place_component", { type: "DIODE", id: "D1", x: 10, y: 0, params: { model: "NO_SUCH_MODEL" } });
      await call("place_component", { type: "GROUND", id: "GND1", x: 0, y: 5 });
      for (const [a, ap, b, bp] of [
        ["V1", "pos", "R1", "1"],
        ["R1", "2", "D1", "anode"],
        ["D1", "cathode", "GND1", "0"],
        ["V1", "neg", "GND1", "0"],
      ]) {
        await call("connect_pins", { fromComponentId: a, fromPinId: ap, toComponentId: b, toPinId: bp });
      }

      const bad = await call("run_simulation", { mode: "op" });
      expect(bad.ok).toBe(false);
      expect(bad.error.code).toBe("SPICE_ERROR");
      expect(bad.error.componentIds).toContain("D1");

      await call("update_component", { id: "D1", params: { model: "1N4148" } });
      const good = await call("run_simulation", { mode: "op" });
      expect(good.ok).toBe(true);
      expect(good.data.rawResult).toBeUndefined();
      expect(good.data.engine).toBe("ngspice-wasm");
      expect(good.data.pinVoltages["D1:anode"]).toBeGreaterThan(0.6);
    } finally {
      await client.close();
      await session.dispose();
    }
  });
});

describe("ADR-011: instrument settings single source of truth", () => {
  it("place_component params initialize the instrument window state; window edits reach params", async () => {
    const session = new CircuitSession();
    try {
      session.placeComponent({
        type: "FUNCTION_GENERATOR",
        id: "XFG1",
        x: 0,
        y: 0,
        params: { amplitude: "1V", frequency: "2kHz", offset: "0.5V" },
      });
      session.placeComponent({ type: "MULTIMETER", id: "XMM1", x: 5, y: 0, params: { currentType: "AC" } });
      const fg = session.getGraph().getInstrument("XFG1") as Record<string, unknown>;
      expect(fg["amplitude"]).toBe("1V");
      expect(fg["frequency"]).toBe("2kHz");
      expect(fg["offset"]).toBe("0.5V");
      expect((session.getGraph().getInstrument("XMM1") as Record<string, unknown>)["currentType"]).toBe("AC");

      // Agent edit after creation is mirrored into the window state
      session.updateComponent({ id: "XFG1", params: { amplitude: "3V" } });
      expect((session.getGraph().getInstrument("XFG1") as Record<string, unknown>)["amplitude"]).toBe("3V");

      // Window edit is mirrored into params (what get_circuit_state shows)
      session.updateInstrument({ ...(session.getGraph().getInstrument("XFG1") as never), frequency: "5kHz" });
      expect(session.getGraph().getComponent("XFG1")!.params["frequency"]).toBe("5kHz");
      session.placeComponent({ type: "RESISTOR", id: "RL", x: 10, y: 0, params: { resistance: "1k" } });
      session.placeComponent({ type: "GROUND", id: "GND1", x: 0, y: 5 });
      session.connectPins({ from: { componentId: "XFG1", pinId: "pos" }, to: { componentId: "RL", pinId: "1" } });
      session.connectPins({ from: { componentId: "RL", pinId: "2" }, to: { componentId: "GND1", pinId: "0" } });
      session.connectPins({ from: { componentId: "XFG1", pinId: "com" }, to: { componentId: "GND1", pinId: "0" } });
      expect(session.exportSpice({ mode: "tran" })).toMatch(/SIN\(500m 3 5k\)/);
    } finally {
      await session.dispose();
    }
  });
});
