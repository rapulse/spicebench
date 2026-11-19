import React, { useState, useEffect, useCallback } from "react";
import type { CircuitProject, ComponentType, Rotation } from "@spicebench/core";
import { CURRENT_SCHEMA_VERSION } from "@spicebench/core";
import type { CircuitStats, SimulationSummary } from "@spicebench/mcp";
import { TitleBar } from "./components/TitleBar";
import { MenuBar } from "./components/MenuBar";
import { ToolBar } from "./components/ToolBar";
import { PartsBin } from "./components/PartsBin";
import { Canvas } from "./components/Canvas";
import { StatusBar } from "./components/StatusBar";

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
      });

      // Subscribe to live updates from Main (and MCP agent)
      const unsubCircuit = window.spicebenchApi.onCircuitUpdated((updated) => {
        setCircuit(updated);
        updateStats(updated);
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
  }, []);

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
      setStatusText("New circuit created");
    }
  };

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

  // Global Keyboard Shortcuts (Ctrl+R / Cmd+R to rotate, Del / Backspace to delete, Ctrl+A to select all, Esc to deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
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
  }, [handleRotate, handleDelete, handleSelectAll]);

  return (
    <div className="ewb-window window">
      {/* 1. Classic Windows 95 Title Bar */}
      <TitleBar title={`Electronics Workbench 5.12 - [${circuit.meta.name || "Untitled"}]`} />

      {/* 2. Menu Bar */}
      <MenuBar
        onNew={handleNewCircuit}
        onOpenSample={handleOpenSample}
        onValidate={handleValidate}
        onSimulate={handleSimulate}
        onRotate={handleRotate}
        onDelete={handleDelete}
        onSelectAll={handleSelectAll}
      />

      {/* 3. Main ToolBar + Power Rocker Switch */}
      <ToolBar
        powerOn={powerOn}
        onTogglePower={handleTogglePower}
        onNew={handleNewCircuit}
        onValidate={handleValidate}
        onSimulate={handleSimulate}
        onRotate={handleRotate}
        onDelete={handleDelete}
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
      />

      {/* 6. Win95 Status Bar */}
      <StatusBar
        cursorPos={cursorPos}
        statusText={statusText}
        stats={stats}
        powerOn={powerOn}
      />
    </div>
  );
};
