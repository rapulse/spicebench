import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CircuitSession, type SimulationSummary } from "@spicebench/mcp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const session = new CircuitSession();

function loadSample(name: "voltage-divider" | "rc-step" | "rlc-filter") {
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
  } else if (name === "rc-step") {
    session.placeComponent({ type: "DC_VOLTAGE_SOURCE", id: "V1", params: { voltage: "5V" }, x: 10, y: 10 });
    session.placeComponent({ type: "RESISTOR", id: "R1", params: { resistance: "1k" }, x: 20, y: 10 });
    session.placeComponent({ type: "CAPACITOR", id: "C1", params: { capacitance: "1uF" }, x: 20, y: 20 });
    session.placeComponent({ type: "GROUND", id: "GND1", x: 10, y: 20 });

    session.connectPins({ from: { componentId: "V1", pinId: "pos" }, to: { componentId: "R1", pinId: "1" } });
    session.connectPins({ from: { componentId: "R1", pinId: "2" }, to: { componentId: "C1", pinId: "1" } });
    session.connectPins({ from: { componentId: "C1", pinId: "2" }, to: { componentId: "GND1", pinId: "0" } });
    session.connectPins({ from: { componentId: "V1", pinId: "neg" }, to: { componentId: "GND1", pinId: "0" } });
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
  }

  return session.getCircuit();
}

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

  ipcMain.handle("spicebench:load-sample", (_e, name) => {
    const circuit = loadSample(name);
    broadcastCircuitUpdate();
    broadcastSimulationUpdate(null);
    return circuit;
  });
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
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Default initial sample circuit
  loadSample("voltage-divider");

  if (process.env["VITE_DEV_SERVER_URL"]) {
    mainWindow.loadURL(process.env["VITE_DEV_SERVER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
