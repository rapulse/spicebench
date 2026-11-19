import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import http from "node:http";
import {
  createSpiceBenchMcpServer,
  startHttpSseTransport,
  CircuitSession,
} from "../src/index";

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

  it("launches and responds to HTTP discovery/health endpoint over HTTP transport", async () => {
    const testPort = 3198;
    const instance = createSpiceBenchMcpServer();
    const httpInstance = await startHttpSseTransport(instance.server, { port: testPort });

    try {
      const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        http.get(`http://localhost:${testPort}/health`, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
          res.on("error", reject);
        });
      });

      expect(response.status).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.status).toBe("ok");
      expect(json.service).toBe("SpiceBench MCP Server");
    } finally {
      await httpInstance.close();
    }
  });
});
