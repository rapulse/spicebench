import React, { useState, useEffect, useCallback } from "react";
import type {
  CircuitProject,
  Component,
  ComponentType,
  Rotation,
  InstrumentState,
  MultimeterState,
  FunctionGeneratorState,
  OscilloscopeState,
  BodePlotterState,
} from "@spicebench/core";
import { CURRENT_SCHEMA_VERSION } from "@spicebench/core";
import type { CircuitStats, SimulationSummary } from "@spicebench/mcp";
import { TitleBar } from "./components/TitleBar";
import { MenuBar } from "./components/MenuBar";
import { ToolBar } from "./components/ToolBar";
import { PartsBin } from "./components/PartsBin";
import { Canvas } from "./components/Canvas";
import { StatusBar } from "./components/StatusBar";
import { ComponentDialog } from "./components/ComponentDialog";
import { InstrumentWindow } from "./components/InstrumentWindow";
import { MultimeterPanel } from "./components/instruments/MultimeterPanel";
import { FunctionGeneratorPanel } from "./components/instruments/FunctionGeneratorPanel";
import { OscilloscopePanel } from "./components/instruments/OscilloscopePanel";
import { BodePlotterPanel } from "./components/instruments/BodePlotterPanel";
import { McpServerDialog } from "./components/McpServerDialog";
import type { McpServerStatus } from "./types/ipc";

const emptyCircuit: CircuitProject = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  meta: {
    name: "Untitled Circuit",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  components: [],
  wires: [],
  junctions: [],
  instruments: [],
};

export const App: React.FC = () => {
  const [circuit, setCircuit] = useState<CircuitProject>(emptyCircuit);
  const [stats, setStats] = useState<CircuitStats>({
    componentCount: 0,
    wireCount: 0,
    junctionCount: 0,
    instrumentCount: 0,
  });
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);
  const [powerOn, setPowerOn] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [statusText, setStatusText] = useState<string>("Ready");
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null);
  const [isMcpDialogOpen, setIsMcpDialogOpen] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1.0);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showNodeVoltages, setShowNodeVoltages] = useState<boolean>(true);
  const [clipboard, setClipboard] = useState<Component[]>([]);

  const refreshUndoState = useCallback(async () => {
    if (typeof window !== "undefined" && window.spicebenchApi?.canUndo) {
      try {
        const u = await window.spicebenchApi.canUndo();
        const r = await window.spicebenchApi.canRedo();
        setCanUndo(u);
        setCanRedo(r);
      } catch {
        // Ignored
      }
    }
  }, []);

  const updateStats = (c: CircuitProject) => {
    setStats({
      componentCount: c.components.length,
      wireCount: c.wires.length,
      junctionCount: c.junctions.length,
      instrumentCount: c.instruments.length,
    });
  };

  // Initial load from Electron Main
  useEffect(() => {
    if (typeof window !== "undefined" && window.spicebenchApi) {
      window.spicebenchApi.getCircuit().then((c) => {
        setCircuit(c);
        updateStats(c);
        refreshUndoState();
      });

      window.spicebenchApi.getMcpStatus?.().then((st) => {
        setMcpStatus(st);
      });

      // Subscribe to live updates from Main (and MCP agent)
      const unsubCircuit = window.spicebenchApi.onCircuitUpdated((updated) => {
        setCircuit(updated);
        updateStats(updated);
        refreshUndoState();
        setStatusText("Circuit updated");
      });

      const unsubSim = window.spicebenchApi.onSimulationUpdated((sim) => {
        setSimulation(sim);
        if (sim) {
          setStatusText(`Simulated: ${sim.mode.toUpperCase()} (${sim.durationMs}ms)`);
        } else {
          setStatusText("Power Off");
        }
      });

      const unsubAction = window.spicebenchApi.onAgentAction?.((action) => {
        setStatusText(`AI Agent: [${action.tool}] ${action.description}`);
      });

      const unsubMcp = window.spicebenchApi.onMcpStatusChanged?.((st) => {
        setMcpStatus(st);
      });

      const unsubOpenMcp = window.spicebenchApi.onOpenMcpDialogRequested?.(() => {
        setIsMcpDialogOpen(true);
      });

      return () => {
        unsubCircuit();
        unsubSim();
        unsubAction?.();
        unsubMcp?.();
        unsubOpenMcp?.();
      };
    }
  }, [refreshUndoState]);

  const handleTogglePower = async () => {
    const nextPower = !powerOn;
    setPowerOn(nextPower);

    if (window.spicebenchApi) {
      try {
        const res = await window.spicebenchApi.setPower(nextPower);
        setSimulation(res);
        if (nextPower && res) {
          setStatusText(`Simulation Running: ${res.mode.toUpperCase()} (Finished in ${res.durationMs}ms)`);
        } else {
          setStatusText("Simulation Stopped");
        }
      } catch (err) {
        setStatusText(`Simulation Error: ${err instanceof Error ? err.message : String(err)}`);
        setPowerOn(false);
      }
    }
  };

  const handleNewCircuit = async () => {
    if (window.spicebenchApi) {
      await window.spicebenchApi.resetCircuit();
      setSelectedIds([]);
      setPowerOn(false);
      setSimulation(null);
      refreshUndoState();
      setStatusText("New circuit created");
    }
  };

  const handleToggleMcpServer = async (enable: boolean, port?: number) => {
    if (window.spicebenchApi?.toggleMcpServer) {
      try {
        const next = await window.spicebenchApi.toggleMcpServer(enable, port);
        setMcpStatus(next);
        setStatusText(next.running ? `MCP Server active on port ${next.port}` : "MCP Server stopped");
      } catch (err) {
        setStatusText(`MCP Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleOpenProject = useCallback(async () => {
    if (window.spicebenchApi) {
      try {
        const res = await window.spicebenchApi.openProject();
        if (res) {
          setCircuit(res.circuit);
          updateStats(res.circuit);
          setSelectedIds([]);
          setPowerOn(false);
          setSimulation(null);
          refreshUndoState();
          setStatusText(`Opened: ${res.name}`);
        }
      } catch (err) {
        setStatusText(`Open error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [refreshUndoState]);

  const handleSaveProject = useCallback(async () => {
    if (window.spicebenchApi) {
      try {
        const res = await window.spicebenchApi.saveProject();
        if (res) {
          setStatusText(`Saved: ${res.name}`);
        }
      } catch (err) {
        setStatusText(`Save error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, []);

  const handleExportNetlist = useCallback(async () => {
    if (window.spicebenchApi) {
      try {
        const res = await window.spicebenchApi.exportNetlist();
        if (res) {
          setStatusText(`Exported SPICE netlist: ${res.name}`);
        }
      } catch (err) {
        setStatusText(`Export error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, []);

  const handleImportNetlist = useCallback(async () => {
    if (window.spicebenchApi?.importNetlist) {
      try {
        const res = await window.spicebenchApi.importNetlist();
        if (res) {
          setCircuit(res.circuit);
          updateStats(res.circuit);
          setSelectedIds([]);
          setPowerOn(false);
          setSimulation(null);
          setStatusText(
            `Imported SPICE netlist: ${res.name} (${res.circuit.components.length} components)`
          );
        }
      } catch (err) {
        setStatusText(`Import error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, []);

  const handleToggleSwitch = useCallback(
    async (comp: Component) => {
      if (window.spicebenchApi) {
        const currentState = comp.params["state"] || "open";
        const nextState = currentState === "closed" ? "open" : "closed";
        try {
          await window.spicebenchApi.updateComponent({
            id: comp.id,
            params: { ...comp.params, state: nextState },
          });
          setStatusText(`Switch '${comp.id}' ${nextState}`);
          if (powerOn) {
            const sim = await window.spicebenchApi.runSimulation();
            setSimulation(sim);
          }
        } catch (err) {
          setStatusText(
            `Error toggling switch: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    },
    [powerOn]
  );

  const handleAdjustPotentiometer = useCallback(
    async (comp: Component, deltaPct: number) => {
      if (window.spicebenchApi) {
        const currentPct = parseFloat(comp.params["percent"] || "50");
        const nextPct = Math.min(100, Math.max(0, Math.round(currentPct + deltaPct)));
        try {
          await window.spicebenchApi.updateComponent({
            id: comp.id,
            params: { ...comp.params, percent: String(nextPct) },
          });
          setStatusText(`Potentiometer '${comp.id}' set to ${nextPct}%`);
          if (powerOn) {
            const sim = await window.spicebenchApi.runSimulation();
            setSimulation(sim);
          }
        } catch (err) {
          setStatusText(
            `Error adjusting pot: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    },
    [powerOn]
  );

  const handleOpenSample = async (
    sampleName: "voltage-divider" | "rc-step" | "rlc-filter" | "interactive-logic"
  ) => {
    if (window.spicebenchApi) {
      const c = await window.spicebenchApi.loadSampleCircuit(sampleName);
      setCircuit(c);
      updateStats(c);
      setSelectedIds([]);
      setPowerOn(false);
      setSimulation(null);
      setStatusText(`Loaded sample: ${sampleName}`);
    }
  };

  const handleValidate = async () => {
    if (window.spicebenchApi) {
      const report = await window.spicebenchApi.validateCircuit();
      if (report.isValid) {
        setStatusText("✓ Topology validation passed: 0 errors");
      } else {
        const firstErr = report.errors[0];
        setStatusText(`✗ Validation error: [${firstErr?.code}] ${firstErr?.message}`);
      }
    }
  };

  const handleSimulate = async () => {
    if (window.spicebenchApi) {
      try {
        setStatusText("Simulating...");
        const res = await window.spicebenchApi.runSimulation();
        setSimulation(res);
        setPowerOn(true);
        setStatusText(`Simulation completed: ${res.mode.toUpperCase()} (${res.durationMs}ms)`);
      } catch (err) {
        setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleSelectComponent = async (type: ComponentType) => {
    if (window.spicebenchApi) {
      // Place near cursor position or default center
      const posX = cursorPos.x || 15;
      const posY = cursorPos.y || 15;
      try {
        const comp = await window.spicebenchApi.placeComponent({
          type,
          x: posX,
          y: posY,
        });
        setSelectedIds([comp.id]);
        setStatusText(`Placed ${comp.type} '${comp.id}' at (${posX}, ${posY})`);
      } catch (err) {
        setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleDropComponent = async (type: ComponentType, gridPos: { x: number; y: number }) => {
    if (window.spicebenchApi) {
      try {
        const comp = await window.spicebenchApi.placeComponent({
          type,
          x: gridPos.x,
          y: gridPos.y,
        });
        setSelectedIds([comp.id]);
        setStatusText(`Placed ${comp.type} '${comp.id}' at (${gridPos.x}, ${gridPos.y})`);
      } catch (err) {
        setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleMoveComponent = async (id: string, newPos: { x: number; y: number }) => {
    if (window.spicebenchApi) {
      try {
        await window.spicebenchApi.updateComponent({
          id,
          x: newPos.x,
          y: newPos.y,
        });
        setStatusText(`Moved '${id}' to (${newPos.x}, ${newPos.y})`);
      } catch (err) {
        setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleConnectPins = async (options: {
    from: { componentId: string; pinId: string };
    to: { componentId: string; pinId: string };
  }) => {
    if (window.spicebenchApi) {
      try {
        await window.spicebenchApi.connectPins(options);
        setStatusText(
          `Connected ${options.from.componentId}:${options.from.pinId} to ${options.to.componentId}:${options.to.pinId}`
        );
      } catch (err) {
        setStatusText(`Connection Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleConnectToWire = async (options: {
    from: { componentId: string; pinId: string };
    targetWireId: string;
    hitPoint: { x: number; y: number };
  }) => {
    if (window.spicebenchApi) {
      try {
        await window.spicebenchApi.connectToWire(options);
        setStatusText(
          `Connected ${options.from.componentId}:${options.from.pinId} to wire at (${options.hitPoint.x}, ${options.hitPoint.y}) with junction`
        );
      } catch (err) {
        setStatusText(`Connection Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleRotate = useCallback(async () => {
    if (window.spicebenchApi && selectedIds.length > 0) {
      let rotatedCount = 0;
      for (const id of selectedIds) {
        const comp = circuit.components.find((c) => c.id === id);
        if (comp) {
          const nextRotation = (((comp.rotation || 0) + 90) % 360) as Rotation;
          await window.spicebenchApi.updateComponent({
            id,
            rotation: nextRotation,
          });
          rotatedCount++;
        }
      }
      if (rotatedCount > 0) {
        setStatusText(`Rotated ${rotatedCount} component(s) +90°`);
      }
    }
  }, [circuit.components, selectedIds]);

  const handleDelete = useCallback(async () => {
    if (window.spicebenchApi && selectedIds.length > 0) {
      const count = selectedIds.length;
      for (const id of selectedIds) {
        try {
          await window.spicebenchApi.removeComponent(id);
        } catch {
          // May be an already removed element or wire
        }
      }
      setSelectedIds([]);
      setStatusText(`Deleted ${count} element(s)`);
    }
  }, [selectedIds]);

  const handleSelectAll = useCallback(() => {
    const allIds = circuit.components.map((c) => c.id);
    setSelectedIds(allIds);
    setStatusText(`Selected all ${allIds.length} component(s)`);
  }, [circuit.components]);

  const handleUndo = useCallback(async () => {
    if (window.spicebenchApi) {
      try {
        const ok = await window.spicebenchApi.undo();
        if (ok) {
          setStatusText("Undo");
          refreshUndoState();
        }
      } catch (err) {
        setStatusText(`Undo failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [refreshUndoState]);

  const handleRedo = useCallback(async () => {
    if (window.spicebenchApi) {
      try {
        const ok = await window.spicebenchApi.redo();
        if (ok) {
          setStatusText("Redo");
          refreshUndoState();
        }
      } catch (err) {
        setStatusText(`Redo failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [refreshUndoState]);

  const handleUpdateInstrument = useCallback(
    async (state: InstrumentState) => {
      if (window.spicebenchApi?.updateInstrument) {
        try {
          await window.spicebenchApi.updateInstrument(state);
          if (powerOn) {
            const res = await window.spicebenchApi.runSimulation();
            setSimulation(res);
          }
        } catch (err) {
          console.error("Failed to update instrument state:", err);
        }
      } else {
        setCircuit((prev) => {
          const exists = prev.instruments.some((i) => i.instrumentId === state.instrumentId);
          const nextInstruments = exists
            ? prev.instruments.map((i) => (i.instrumentId === state.instrumentId ? state : i))
            : [...prev.instruments, state];
          return { ...prev, instruments: nextInstruments };
        });
      }
    },
    [powerOn]
  );

  const handleComponentDoubleClick = useCallback(
    (comp: Component) => {
      if (
        ["MULTIMETER", "FUNCTION_GENERATOR", "OSCILLOSCOPE", "BODE_PLOTTER"].includes(comp.type)
      ) {
        const currentInst = circuit.instruments.find((i) => i.instrumentId === comp.id);
        if (currentInst) {
          handleUpdateInstrument({ ...currentInst, isOpen: true });
        }
      } else {
        setEditingComponent(comp);
      }
    },
    [circuit.instruments, handleUpdateInstrument]
  );

  const handleSaveComponentProps = useCallback(
    async (id: string, updates: { label?: string; params: Record<string, string> }) => {
      if (window.spicebenchApi) {
        try {
          await window.spicebenchApi.updateComponent({
            id,
            label: updates.label,
            params: updates.params,
          });
          setStatusText(`Updated properties of '${id}'`);
          refreshUndoState();
        } catch (err) {
          setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    },
    [refreshUndoState]
  );

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.0, Number((z + 0.2).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(2))));
  }, []);

  const handleCopy = useCallback(() => {
    const picked = circuit.components.filter((c) => selectedIds.includes(c.id));
    if (picked.length === 0) return;
    setClipboard(picked.map((c) => ({ ...c, params: { ...c.params }, position: { ...c.position } })));
    setStatusText(`Copied ${picked.length} component(s)`);
  }, [circuit.components, selectedIds]);

  const handleCut = useCallback(async () => {
    const picked = circuit.components.filter((c) => selectedIds.includes(c.id));
    if (picked.length === 0) return;
    setClipboard(picked.map((c) => ({ ...c, params: { ...c.params }, position: { ...c.position } })));
    await handleDelete();
    setStatusText(`Cut ${picked.length} component(s)`);
  }, [circuit.components, selectedIds, handleDelete]);

  const handlePaste = useCallback(async () => {
    if (clipboard.length === 0 || !window.spicebenchApi) return;
    const newIds: string[] = [];
    for (const src of clipboard) {
      try {
        const placed = await window.spicebenchApi.placeComponent({
          type: src.type,
          x: src.position.x + 2,
          y: src.position.y + 2,
          rotation: src.rotation,
          params: { ...src.params },
        });
        newIds.push(placed.id);
      } catch (err) {
        setStatusText(`Paste error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (newIds.length > 0) {
      setSelectedIds(newIds);
      setStatusText(`Pasted ${newIds.length} component(s)`);
      refreshUndoState();
    }
  }, [clipboard, refreshUndoState]);

  const handleOpenProperties = useCallback(() => {
    const comp = circuit.components.find((c) => selectedIds.includes(c.id));
    if (comp) {
      handleComponentDoubleClick(comp);
    } else {
      setStatusText("Select a component to inspect its properties");
    }
  }, [circuit.components, selectedIds, handleComponentDoubleClick]);

  const handleActivate = useCallback(async () => {
    if (!powerOn) await handleTogglePower();
  }, [powerOn, handleTogglePower]);

  const handleStop = useCallback(async () => {
    if (powerOn) await handleTogglePower();
  }, [powerOn, handleTogglePower]);

  const handleOpenInstrumentFromMenu = useCallback(
    (instrumentId: string) => {
      const inst = circuit.instruments.find((i) => i.instrumentId === instrumentId);
      if (inst) {
        handleUpdateInstrument({ ...inst, isOpen: true });
      }
    },
    [circuit.instruments, handleUpdateInstrument]
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveProject();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleOpenProject();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewCircuit();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleRotate();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setIsMcpDialogOpen((prev) => !prev);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleCut();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePaste();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleActivate();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleStop();
      } else if (e.key === "Escape") {
        setSelectedIds([]);
        setStatusText("Selection cleared");
      } else if (e.key === " " || e.key === "Spacebar") {
        const selectedSwitch = circuit.components.find(
          (c) => selectedIds.includes(c.id) && c.type === "SWITCH_SPST"
        );
        if (selectedSwitch) {
          e.preventDefault();
          handleToggleSwitch(selectedSwitch);
        }
      } else if (e.key === "[" || e.key === "]") {
        const selectedPot = circuit.components.find(
          (c) => selectedIds.includes(c.id) && c.type === "POTENTIOMETER"
        );
        if (selectedPot) {
          e.preventDefault();
          handleAdjustPotentiometer(selectedPot, e.key === "[" ? -5 : 5);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleSaveProject,
    handleOpenProject,
    handleNewCircuit,
    handleRotate,
    handleDelete,
    handleSelectAll,
    handleCopy,
    handleCut,
    handlePaste,
    handleActivate,
    handleStop,
    circuit.components,
    selectedIds,
    handleToggleSwitch,
    handleAdjustPotentiometer,
  ]);

  return (
    <div className="ewb-window window">
      {/* 1. Classic Windows 95 Title Bar */}
      <TitleBar title={`Electronics Workbench 5.12 - [${circuit.meta.name || "Untitled"}]`} />

      {/* 2. Menu Bar */}
      <MenuBar
        onNew={handleNewCircuit}
        onOpen={handleOpenProject}
        onSave={handleSaveProject}
        onExportNetlist={handleExportNetlist}
        onImportNetlist={handleImportNetlist}
        onExit={() => window.close()}
        onOpenSample={handleOpenSample}
        onValidate={handleValidate}
        onSimulate={handleSimulate}
        onActivate={handleActivate}
        onStop={handleStop}
        onRotate={handleRotate}
        onProperties={handleOpenProperties}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((g) => !g)}
        showNodeVoltages={showNodeVoltages}
        onToggleNodeVoltages={() => setShowNodeVoltages((v) => !v)}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDelete}
        onSelectAll={handleSelectAll}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenMcpDialog={() => setIsMcpDialogOpen(true)}
        instruments={circuit.instruments.map((inst) => {
          const comp = circuit.components.find((c) => c.id === inst.instrumentId);
          return {
            id: inst.instrumentId,
            label: comp ? `${comp.type} - ${comp.label || comp.id}` : inst.instrumentId,
            isOpen: inst.isOpen,
          };
        })}
        onOpenInstrument={handleOpenInstrumentFromMenu}
        onAbout={() =>
          setStatusText("SpiceBench (Electronics Workbench 5.12 UI + ngspice-45.2 WASM + MCP)")
        }
      />

      {/* 3. Main ToolBar + Power Rocker Switch */}
      <ToolBar
        powerOn={powerOn}
        onTogglePower={handleTogglePower}
        onNew={handleNewCircuit}
        onOpen={handleOpenProject}
        onSave={handleSaveProject}
        onValidate={handleValidate}
        onSimulate={handleSimulate}
        onRotate={handleRotate}
        onDelete={handleDelete}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        canPaste={clipboard.length > 0}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomChange={setZoom}
        onHelp={() =>
          setStatusText("Shortcuts: Ctrl+G Activate, Ctrl+T Stop, Ctrl+R Rotate, Ctrl+C/X/V Copy/Cut/Paste")
        }
      />

      {/* 4. Parts Bin Shelf */}
      <PartsBin onSelectComponent={handleSelectComponent} />

      {/* 5. Scalable & Pannable SVG Schematic Canvas */}
      <Canvas
        circuit={circuit}
        simulation={simulation}
        selectedIds={selectedIds}
        onSelect={setSelectedIds}
        onCursorMove={setCursorPos}
        onDropComponent={handleDropComponent}
        onMoveComponent={handleMoveComponent}
        onConnectPins={handleConnectPins}
        onConnectToWire={handleConnectToWire}
        onWiringStatusChange={(msg) => msg && setStatusText(msg)}
        onComponentDoubleClick={handleComponentDoubleClick}
        onToggleSwitch={handleToggleSwitch}
        onAdjustPotentiometer={handleAdjustPotentiometer}
        zoom={zoom}
        onZoomChange={setZoom}
        showGrid={showGrid}
        showNodeVoltages={showNodeVoltages}
      >
        {/* Floating Instrument Windows */}
        {circuit.instruments
          .filter((inst) => inst.isOpen)
          .map((inst) => {
            const comp = circuit.components.find((c) => c.id === inst.instrumentId);
            if (!comp) return null;

            let panelContent: React.ReactNode = null;
            let title = `${comp.label || comp.id}`;

            if (comp.type === "MULTIMETER") {
              title = `Multimeter - ${comp.label || comp.id}`;
              panelContent = (
                <MultimeterPanel
                  component={comp}
                  state={inst as MultimeterState}
                  simulation={simulation}
                  onStateChange={handleUpdateInstrument}
                />
              );
            } else if (comp.type === "FUNCTION_GENERATOR") {
              title = `Function Generator - ${comp.label || comp.id}`;
              panelContent = (
                <FunctionGeneratorPanel
                  component={comp}
                  state={inst as FunctionGeneratorState}
                  onStateChange={handleUpdateInstrument}
                  onParamsChange={(params) => {
                    if (window.spicebenchApi) {
                      window.spicebenchApi.updateComponent({ id: comp.id, params });
                    }
                  }}
                />
              );
            } else if (comp.type === "OSCILLOSCOPE") {
              title = `Oscilloscope - ${comp.label || comp.id}`;
              panelContent = (
                <OscilloscopePanel
                  component={comp}
                  state={inst as OscilloscopeState}
                  simulation={simulation}
                  onStateChange={handleUpdateInstrument}
                />
              );
            } else if (comp.type === "BODE_PLOTTER") {
              title = `Bode Plotter - ${comp.label || comp.id}`;
              panelContent = (
                <BodePlotterPanel
                  component={comp}
                  state={inst as BodePlotterState}
                  simulation={simulation}
                  onStateChange={handleUpdateInstrument}
                />
              );
            }

            return (
              <InstrumentWindow
                key={inst.instrumentId}
                title={title}
                position={inst.windowPosition}
                onMove={(newPos) =>
                  handleUpdateInstrument({ ...inst, windowPosition: newPos })
                }
                onClose={() =>
                  handleUpdateInstrument({ ...inst, isOpen: false })
                }
              >
                {panelContent}
              </InstrumentWindow>
            );
          })}
      </Canvas>

      {/* 6. Win95 Status Bar */}
      <StatusBar
        cursorPos={cursorPos}
        statusText={statusText}
        stats={stats}
        powerOn={powerOn}
        mcpStatus={mcpStatus}
        onOpenMcpDialog={() => setIsMcpDialogOpen(true)}
      />

      {/* 7. Win95 Component Properties Modal */}
      <ComponentDialog
        component={editingComponent}
        isOpen={!!editingComponent}
        onSave={handleSaveComponentProps}
        onClose={() => setEditingComponent(null)}
      />

      {/* 8. Win95 MCP Server Settings & Activity Dialog */}
      <McpServerDialog
        isOpen={isMcpDialogOpen}
        status={mcpStatus}
        onClose={() => setIsMcpDialogOpen(false)}
        onToggleServer={handleToggleMcpServer}
      />
    </div>
  );
};
