import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CircuitSession,
  createSpiceBenchMcpServer,
  startHttpTransport,
  type SimulationSummary,
  type AgentActionLog,
  type HttpTransportInstance,
} from "@spicebench/mcp";
import { parseCircuitProject, serializeCircuitProject } from "@spicebench/core";
import { NetlistCompiler, SpiceImporter } from "@spicebench/sim";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveWorkerPath(): string {
  const bundled = path.join(__dirname, "ngspice-worker.js");
  // Node worker_threads cannot load ESM scripts directly from inside app.asar
  const unpacked = bundled.replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);
  return unpacked !== bundled && existsSync(unpacked) ? unpacked : bundled;
}

let mainWindow: BrowserWindow | null = null;
// ngspice (WASM) runs in a worker bundled next to main.js as dist-electron/ngspice-worker.js (ADR-007).
const session = new CircuitSession(undefined, {
  runner: { workerPath: resolveWorkerPath() },
});
// Each MCP client gets its own McpServer bound to the shared session (ADR-010).
const createMcpServerForClient = () => createSpiceBenchMcpServer({ session }).server;
const MCP_HOST = "127.0.0.1";
let mcpTransport: HttpTransportInstance | null = null;
let mcpPort = parseInt(process.env["SPICEBENCH_MCP_PORT"] || "3100", 10);
let mcpRunning = false;

function broadcastCircuitUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("spicebench:circuit-updated", session.getCircuit());
  }
}

function broadcastSimulationUpdate(summary: SimulationSummary | null) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("spicebench:simulation-updated", summary);
  }
}

function broadcastAgentAction(action: AgentActionLog) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("spicebench:agent-action", action);
  }
}

function broadcastMcpStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("spicebench:mcp-status-changed", getMcpStatus());
  }
}

function getMcpStatus() {
  return {
    running: mcpRunning,
    port: mcpPort,
    host: MCP_HOST,
    mcpUrl: `http://${MCP_HOST}:${mcpPort}/mcp`,
    activeSessions: mcpTransport?.activeSessions() ?? 0,
    recentActions: session.getActionHistory(),
  };
}

async function startMcpServer(port = mcpPort) {
  if (mcpRunning && mcpTransport) {
    await stopMcpServer();
  }
  try {
    mcpPort = port;
    mcpTransport = await startHttpTransport(createMcpServerForClient, { port: mcpPort, host: MCP_HOST });
    mcpRunning = true;
    console.log(`[SpiceBench MCP]: Server running at ${mcpTransport.mcpUrl}`);
    broadcastMcpStatus();
  } catch (err) {
    mcpRunning = false;
    mcpTransport = null;
    console.error(`[SpiceBench MCP]: Failed to start on port ${port}:`, err);
    broadcastMcpStatus();
  }
  return getMcpStatus();
}

async function stopMcpServer() {
  if (mcpTransport) {
    try {
      await mcpTransport.close();
    } catch {
      // ignore
    }
    mcpTransport = null;
  }
  mcpRunning = false;
  console.log(`[SpiceBench MCP]: Server stopped.`);
  broadcastMcpStatus();
  return getMcpStatus();
}

function getMcpClientConfigs() {
  const mcpUrl = `http://${MCP_HOST}:${mcpPort}/mcp`;
  const json = (o: unknown) => JSON.stringify(o, null, 2);

  // Claude Desktop config file supports stdio servers only: bridge to HTTP via mcp-remote.
  const claudeDesktop = json({
    mcpServers: { spicebench: { command: "npx", args: ["-y", "mcp-remote", mcpUrl] } },
  });
  const cursor = json({ mcpServers: { spicebench: { url: mcpUrl } } });
  const antigravity = json({ mcpServers: { spicebench: { serverUrl: mcpUrl } } });

  return { claudeDesktop, cursor, antigravity };
}

// Hook session reactive events to broadcast to Renderer
session.onCircuitChange(() => {
  broadcastCircuitUpdate();
});

session.onSimulationChange((summary) => {
  broadcastSimulationUpdate(summary);
});

session.onAgentAction((action) => {
  broadcastAgentAction(action);
  broadcastMcpStatus();
});

function loadSample(
  name: "voltage-divider" | "rc-step" | "rlc-filter" | "interactive-logic"
) {
  session.reset();

  if (name === "voltage-divider") {
    session.placeComponent({ type: "DC_VOLTAGE_SOURCE", id: "V1", params: { voltage: "12V" }, x: 10, y: 10 });
    session.placeComponent({ type: "RESISTOR", id: "R1", params: { resistance: "30k" }, x: 20, y: 10 });
    session.placeComponent({ type: "RESISTOR", id: "R2", params: { resistance: "10k" }, x: 20, y: 20 });
    session.placeComponent({ type: "GROUND", id: "GND1", x: 10, y: 20 });

    session.connectPins({ from: { componentId: "V1", pinId: "pos" }, to: { componentId: "R1", pinId: "1" } });
    session.connectPins({ from: { componentId: "R1", pinId: "2" }, to: { componentId: "R2", pinId: "1" } });
    session.connectPins({ from: { componentId: "R2", pinId: "2" }, to: { componentId: "GND1", pinId: "0" } });
    session.connectPins({ from: { componentId: "V1", pinId: "neg" }, to: { componentId: "GND1", pinId: "0" } });

    // Default virtual multimeter attached across R2
    session.placeComponent({ type: "MULTIMETER", id: "XMM1", x: 30, y: 15 });
    session.connectPins({ from: { componentId: "R1", pinId: "2" }, to: { componentId: "XMM1", pinId: "pos" } });
    session.connectPins({ from: { componentId: "R2", pinId: "2" }, to: { componentId: "XMM1", pinId: "neg" } });
    session.updateInstrument({
      instrumentId: "XMM1",
      isOpen: true,
      windowPosition: { x: 500, y: 80 },
      mode: "V",
      currentType: "DC",
    });
  } else if (name === "rc-step") {
    session.placeComponent({ type: "DC_VOLTAGE_SOURCE", id: "V1", params: { voltage: "5V" }, x: 10, y: 10 });
    session.placeComponent({ type: "RESISTOR", id: "R1", params: { resistance: "1k" }, x: 20, y: 10 });
    session.placeComponent({ type: "CAPACITOR", id: "C1", params: { capacitance: "1uF" }, x: 20, y: 20 });
    session.placeComponent({ type: "GROUND", id: "GND1", x: 10, y: 20 });

    session.connectPins({ from: { componentId: "V1", pinId: "pos" }, to: { componentId: "R1", pinId: "1" } });
    session.connectPins({ from: { componentId: "R1", pinId: "2" }, to: { componentId: "C1", pinId: "1" } });
    session.connectPins({ from: { componentId: "C1", pinId: "2" }, to: { componentId: "GND1", pinId: "0" } });
    session.connectPins({ from: { componentId: "V1", pinId: "neg" }, to: { componentId: "GND1", pinId: "0" } });

    // Default virtual oscilloscope attached across C1
    session.placeComponent({ type: "OSCILLOSCOPE", id: "XSC1", x: 30, y: 15 });
    session.connectPins({ from: { componentId: "R1", pinId: "2" }, to: { componentId: "XSC1", pinId: "ch_a_pos" } });
    session.connectPins({ from: { componentId: "C1", pinId: "2" }, to: { componentId: "XSC1", pinId: "ch_a_neg" } });
    session.updateInstrument({
      instrumentId: "XSC1",
      isOpen: true,
      windowPosition: { x: 460, y: 70 },
      timebase: "0.5ms/div",
      xPos: 0,
      chA: { scale: "1V/div", yPos: 0, coupling: "DC" },
      chB: { scale: "5V/div", yPos: 0, coupling: "DC" },
      trigger: { mode: "auto", edge: "positive", level: 0, source: "chA" },
    });
  } else if (name === "rlc-filter") {
    session.placeComponent({ type: "AC_VOLTAGE_SOURCE", id: "V1", params: { voltage: "1V", frequency: "1kHz" }, x: 10, y: 10 });
    session.placeComponent({ type: "RESISTOR", id: "R1", params: { resistance: "10" }, x: 20, y: 10 });
    session.placeComponent({ type: "INDUCTOR", id: "L1", params: { inductance: "10mH" }, x: 30, y: 10 });
    session.placeComponent({ type: "CAPACITOR", id: "C1", params: { capacitance: "2.533uF" }, x: 30, y: 20 });
    session.placeComponent({ type: "GROUND", id: "GND1", x: 10, y: 20 });

    session.connectPins({ from: { componentId: "V1", pinId: "pos" }, to: { componentId: "R1", pinId: "1" } });
    session.connectPins({ from: { componentId: "R1", pinId: "2" }, to: { componentId: "L1", pinId: "1" } });
    session.connectPins({ from: { componentId: "L1", pinId: "2" }, to: { componentId: "C1", pinId: "1" } });
    session.connectPins({ from: { componentId: "C1", pinId: "2" }, to: { componentId: "GND1", pinId: "0" } });
    session.connectPins({ from: { componentId: "V1", pinId: "neg" }, to: { componentId: "GND1", pinId: "0" } });
  } else if (name === "interactive-logic") {
    session.placeComponent({ type: "DC_VOLTAGE_SOURCE", id: "V1", params: { voltage: "5V" }, x: 10, y: 10 });
    session.placeComponent({ type: "SWITCH_SPST", id: "SW1", params: { state: "closed" }, x: 20, y: 10 });
    session.placeComponent({ type: "AND_GATE", id: "U1", x: 32, y: 10 });
    session.placeComponent({ type: "BULB", id: "L1", params: { voltage: "5V", resistance: "50" }, x: 44, y: 10 });
    session.placeComponent({ type: "GROUND", id: "GND1", x: 10, y: 22 });
    session.placeComponent({ type: "GROUND", id: "GND2", x: 44, y: 22 });

    session.connectPins({ from: { componentId: "V1", pinId: "pos" }, to: { componentId: "SW1", pinId: "1" } });
    session.connectPins({ from: { componentId: "SW1", pinId: "2" }, to: { componentId: "U1", pinId: "in1" } });
    session.connectPins({ from: { componentId: "SW1", pinId: "2" }, to: { componentId: "U1", pinId: "in2" } });
    session.connectPins({ from: { componentId: "U1", pinId: "out" }, to: { componentId: "L1", pinId: "1" } });
    session.connectPins({ from: { componentId: "L1", pinId: "2" }, to: { componentId: "GND2", pinId: "0" } });
    session.connectPins({ from: { componentId: "V1", pinId: "neg" }, to: { componentId: "GND1", pinId: "0" } });
  }

  return session.getCircuit();
}

function registerIpcHandlers() {
  ipcMain.handle("spicebench:get-circuit", () => session.getCircuit());
  ipcMain.handle("spicebench:get-stats", () => session.getStats());

  ipcMain.handle("spicebench:place-component", (_e, opts) => {
    const comp = session.placeComponent(opts);
    broadcastCircuitUpdate();
    return comp;
  });

  ipcMain.handle("spicebench:update-component", (_e, opts) => {
    const comp = session.updateComponent(opts);
    broadcastCircuitUpdate();
    return comp;
  });

  ipcMain.handle("spicebench:remove-component", (_e, id) => {
    const res = session.removeComponent(id);
    broadcastCircuitUpdate();
    return res;
  });

  ipcMain.handle("spicebench:connect-pins", (_e, opts) => {
    const wire = session.connectPins(opts);
    broadcastCircuitUpdate();
    return wire;
  });

  ipcMain.handle("spicebench:connect-to-wire", (_e, opts) => {
    const res = session.connectToWire(opts);
    broadcastCircuitUpdate();
    return res;
  });

  ipcMain.handle("spicebench:validate-circuit", () => session.validate());

  ipcMain.handle("spicebench:run-simulation", async (_e, opts) => {
    const summary = await session.runSimulation(opts);
    broadcastSimulationUpdate(summary);
    return summary;
  });

  ipcMain.handle("spicebench:set-power", async (_e, powerOn: boolean) => {
    if (!powerOn) {
      broadcastSimulationUpdate(null);
      return null;
    }
    const summary = await session.runSimulation();
    broadcastSimulationUpdate(summary);
    return summary;
  });

  ipcMain.handle("spicebench:reset-circuit", () => {
    session.reset();
    broadcastCircuitUpdate();
    broadcastSimulationUpdate(null);
  });

  ipcMain.handle("spicebench:undo", () => {
    const res = session.undo();
    broadcastCircuitUpdate();
    return res;
  });

  ipcMain.handle("spicebench:redo", () => {
    const res = session.redo();
    broadcastCircuitUpdate();
    return res;
  });

  ipcMain.handle("spicebench:can-undo", () => session.canUndo);
  ipcMain.handle("spicebench:can-redo", () => session.canRedo);

  ipcMain.handle("spicebench:save-project", async () => {
    if (!mainWindow) return null;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Save Circuit Project",
      defaultPath: "circuit.ewb.json",
      filters: [
        { name: "SpiceBench Circuit (*.ewb.json, *.json)", extensions: ["json"] },
        { name: "All Files (*.*)", extensions: ["*"] },
      ],
    });
    if (canceled || !filePath) return null;
    const circuit = session.getCircuit();
    await fs.writeFile(filePath, serializeCircuitProject(circuit), "utf-8");
    return { filePath, name: path.basename(filePath) };
  });

  ipcMain.handle("spicebench:open-project", async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Open Circuit Project",
      filters: [
        { name: "SpiceBench Circuit (*.ewb.json, *.json)", extensions: ["json"] },
        { name: "All Files (*.*)", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (canceled || filePaths.length === 0 || !filePaths[0]) return null;
    const filePath = filePaths[0];
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    const validated = parseCircuitProject(parsed);
    session.loadCircuit(validated);
    broadcastCircuitUpdate();
    broadcastSimulationUpdate(null);
    return { filePath, circuit: validated, name: path.basename(filePath) };
  });

  ipcMain.handle("spicebench:export-netlist", async () => {
    if (!mainWindow) return null;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Export SPICE Netlist",
      defaultPath: "circuit.cir",
      filters: [
        { name: "SPICE Netlist (*.cir, *.net)", extensions: ["cir", "net"] },
        { name: "All Files (*.*)", extensions: ["*"] },
      ],
    });
    if (canceled || !filePath) return null;
    const compiled = NetlistCompiler.compile(session.getGraph());
    await fs.writeFile(filePath, compiled.netlist, "utf-8");
    return { filePath, name: path.basename(filePath) };
  });

  ipcMain.handle("spicebench:import-netlist", async (_e, rawText?: string) => {
    let content = rawText;
    let fileName = "imported.cir";
    if (!content) {
      if (!mainWindow) return null;
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Import SPICE Netlist",
        filters: [
          {
            name: "SPICE Netlist (*.cir, *.net, *.sp, *.txt)",
            extensions: ["cir", "net", "sp", "txt"],
          },
          { name: "All Files (*.*)", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });
      if (canceled || filePaths.length === 0 || !filePaths[0]) return null;
      const filePath = filePaths[0];
      content = await fs.readFile(filePath, "utf-8");
      fileName = path.basename(filePath);
    }
    const result = SpiceImporter.importNetlist(content, fileName);
    session.loadCircuit(result.project);
    broadcastCircuitUpdate();
    broadcastSimulationUpdate(null);
    return { name: fileName, circuit: result.project, warnings: result.warnings };
  });

  ipcMain.handle("spicebench:update-instrument", (_e, state) => {
    session.updateInstrument(state);
    broadcastCircuitUpdate();
  });

  ipcMain.handle("spicebench:read-instrument", async (_e, id: string) => {
    return session.readInstrument(id);
  });

  ipcMain.handle("spicebench:load-sample", (_e, name) => {
    const circuit = loadSample(name);
    broadcastCircuitUpdate();
    broadcastSimulationUpdate(null);
    return circuit;
  });

  ipcMain.handle("spicebench:mcp-status", () => getMcpStatus());
  ipcMain.handle("spicebench:mcp-toggle", async (_e, enable: boolean, port?: number) => {
    if (enable) {
      return await startMcpServer(port || mcpPort);
    } else {
      return await stopMcpServer();
    }
  });
  ipcMain.handle("spicebench:mcp-get-config", () => getMcpClientConfigs());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Electronics Workbench 5.12 — SpiceBench",
    backgroundColor: "#c0c0c0",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Default initial sample circuit
  const initialSample =
    (process.env["SPICEBENCH_SAMPLE"] as
      | "voltage-divider"
      | "rc-step"
      | "rlc-filter"
      | "interactive-logic") || "voltage-divider";
  loadSample(initialSample);

  if (process.env["VITE_DEV_SERVER_URL"]) {
    mainWindow.loadURL(process.env["VITE_DEV_SERVER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  if (process.env["SPICEBENCH_SCREENSHOT_PATH"]) {
    const screenshotPath = process.env["SPICEBENCH_SCREENSHOT_PATH"];
    mainWindow.webContents.on("did-finish-load", () => {
      setTimeout(async () => {
        if (!mainWindow) return;
        try {
          if (process.env["SPICEBENCH_AUTO_SIMULATE"] === "1") {
            const summary = await session.runSimulation();
            broadcastSimulationUpdate(summary);
            await new Promise((r) => setTimeout(r, 600));
          }
          if (process.env["SPICEBENCH_OPEN_MCP_DIALOG"] === "1") {
            session.logAgentAction("place_component", "Placed RESISTOR 'R3' at (15, 20)");
            session.logAgentAction("connect_pins", "Connected R3:1 -> V1:pos");
            session.logAgentAction("run_simulation", "Operating point simulation (.op) completed");
            mainWindow.webContents.send("spicebench:open-mcp-dialog");
            await new Promise((r) => setTimeout(r, 600));
          }

          const image = await mainWindow.webContents.capturePage();
          await fs.writeFile(screenshotPath, image.toPNG());
          console.log(`[SpiceBench Screenshot]: saved to ${screenshotPath}`);
        } catch (err) {
          console.error(`[SpiceBench Screenshot Error]:`, err);
        } finally {
          app.quit();
        }
      }, 1500);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  createWindow();

  // Load ngspice WASM in the background so the first Power On is instant.
  void session.warmUpSimulator().then((ok) => {
    if (!ok) console.error("[SpiceBench]: ngspice WASM engine failed to initialize");
  });

  // Auto-start embedded MCP server (defaults to 3100 or SPICEBENCH_MCP_PORT)
  await startMcpServer(mcpPort);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", async () => {
  await stopMcpServer();
  await session.dispose();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
