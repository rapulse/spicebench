import { contextBridge, ipcRenderer } from "electron";
import type { CircuitProject } from "@spicebench/core";
import type { SimulationSummary, AgentActionLog } from "@spicebench/mcp";
import type { SpicebenchApi, McpServerStatus } from "../src/types/ipc";

const api: SpicebenchApi = {
  getCircuit: () => ipcRenderer.invoke("spicebench:get-circuit"),
  getStats: () => ipcRenderer.invoke("spicebench:get-stats"),
  placeComponent: (opts) => ipcRenderer.invoke("spicebench:place-component", opts),
  updateComponent: (opts) => ipcRenderer.invoke("spicebench:update-component", opts),
  removeComponent: (id) => ipcRenderer.invoke("spicebench:remove-component", id),
  connectPins: (opts) => ipcRenderer.invoke("spicebench:connect-pins", opts),
  connectToWire: (opts) => ipcRenderer.invoke("spicebench:connect-to-wire", opts),
  validateCircuit: () => ipcRenderer.invoke("spicebench:validate-circuit"),
  runSimulation: (opts) => ipcRenderer.invoke("spicebench:run-simulation", opts),
  setPower: (powerOn) => ipcRenderer.invoke("spicebench:set-power", powerOn),
  resetCircuit: () => ipcRenderer.invoke("spicebench:reset-circuit"),
  saveProject: () => ipcRenderer.invoke("spicebench:save-project"),
  openProject: () => ipcRenderer.invoke("spicebench:open-project"),
  exportNetlist: () => ipcRenderer.invoke("spicebench:export-netlist"),
  undo: () => ipcRenderer.invoke("spicebench:undo"),
  redo: () => ipcRenderer.invoke("spicebench:redo"),
  canUndo: () => ipcRenderer.invoke("spicebench:can-undo"),
  canRedo: () => ipcRenderer.invoke("spicebench:can-redo"),
  updateInstrument: (state) => ipcRenderer.invoke("spicebench:update-instrument", state),
  readInstrument: (id) => ipcRenderer.invoke("spicebench:read-instrument", id),
  loadSampleCircuit: (name) => ipcRenderer.invoke("spicebench:load-sample", name),
  getMcpStatus: () => ipcRenderer.invoke("spicebench:mcp-status"),
  toggleMcpServer: (enable, port) => ipcRenderer.invoke("spicebench:mcp-toggle", enable, port),
  getMcpClientConfigs: () => ipcRenderer.invoke("spicebench:mcp-get-config"),
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
  onAgentAction: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: AgentActionLog) => callback(action);
    ipcRenderer.on("spicebench:agent-action", handler);
    return () => ipcRenderer.removeListener("spicebench:agent-action", handler);
  },
  onMcpStatusChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, status: McpServerStatus) => callback(status);
    ipcRenderer.on("spicebench:mcp-status-changed", handler);
    return () => ipcRenderer.removeListener("spicebench:mcp-status-changed", handler);
  },
  onOpenMcpDialogRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("spicebench:open-mcp-dialog", handler);
    return () => ipcRenderer.removeListener("spicebench:open-mcp-dialog", handler);
  },
};

contextBridge.exposeInMainWorld("spicebenchApi", api);
