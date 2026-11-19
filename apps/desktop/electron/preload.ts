import { contextBridge, ipcRenderer } from "electron";
import type { CircuitProject } from "@spicebench/core";
import type { SimulationSummary } from "@spicebench/mcp";
import type { SpicebenchApi } from "../src/types/ipc";

const api: SpicebenchApi = {
  getCircuit: () => ipcRenderer.invoke("spicebench:get-circuit"),
  getStats: () => ipcRenderer.invoke("spicebench:get-stats"),
  placeComponent: (opts) => ipcRenderer.invoke("spicebench:place-component", opts),
  updateComponent: (opts) => ipcRenderer.invoke("spicebench:update-component", opts),
  removeComponent: (id) => ipcRenderer.invoke("spicebench:remove-component", id),
  connectPins: (opts) => ipcRenderer.invoke("spicebench:connect-pins", opts),
  validateCircuit: () => ipcRenderer.invoke("spicebench:validate-circuit"),
  runSimulation: (opts) => ipcRenderer.invoke("spicebench:run-simulation", opts),
  setPower: (powerOn) => ipcRenderer.invoke("spicebench:set-power", powerOn),
  resetCircuit: () => ipcRenderer.invoke("spicebench:reset-circuit"),
  loadSampleCircuit: (name) => ipcRenderer.invoke("spicebench:load-sample", name),
  onCircuitUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, circuit: CircuitProject) => callback(circuit);
    ipcRenderer.on("spicebench:circuit-updated", handler);
    return () => ipcRenderer.removeListener("spicebench:circuit-updated", handler);
  },
  onSimulationUpdated: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, summary: SimulationSummary | null) => callback(summary);
    ipcRenderer.on("spicebench:simulation-updated", handler);
    return () => ipcRenderer.removeListener("spicebench:simulation-updated", handler);
  },
};

contextBridge.exposeInMainWorld("spicebenchApi", api);
