import React, { useState, useEffect, useCallback } from "react";
import type { CircuitProject, Component, ComponentType, Rotation } from "@spicebench/core";
import { CURRENT_SCHEMA_VERSION } from "@spicebench/core";
import type { CircuitStats, SimulationSummary } from "@spicebench/mcp";
import { TitleBar } from "./components/TitleBar";
import { MenuBar } from "./components/MenuBar";
import { ToolBar } from "./components/ToolBar";
import { PartsBin } from "./components/PartsBin";
import { Canvas } from "./components/Canvas";
import { StatusBar } from "./components/StatusBar";
import { ComponentDialog } from "./components/ComponentDialog";

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

      return () => {
        unsubCircuit();
        unsubSim();
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

  const handleOpenSample = async (sampleName: "voltage-divider" | "rc-step" | "rlc-filter") => {
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

  const handleComponentDoubleClick = useCallback((comp: Component) => {
    setEditingComponent(comp);
  }, []);

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
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === "Escape") {
        setSelectedIds([]);
        setStatusText("Selection cleared");
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
        onOpenSample={handleOpenSample}
        onValidate={handleValidate}
        onSimulate={handleSimulate}
        onRotate={handleRotate}
        onDelete={handleDelete}
        onSelectAll={handleSelectAll}
        onUndo={handleUndo}
        onRedo={handleRedo}
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
      />

      {/* 6. Win95 Status Bar */}
      <StatusBar
        cursorPos={cursorPos}
        statusText={statusText}
        stats={stats}
        powerOn={powerOn}
      />

      {/* 7. Win95 Component Properties Modal */}
      <ComponentDialog
        component={editingComponent}
        isOpen={!!editingComponent}
        onSave={handleSaveComponentProps}
        onClose={() => setEditingComponent(null)}
      />
    </div>
  );
};
