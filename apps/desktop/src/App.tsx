import React, { useState, useEffect } from "react";
import type { CircuitProject, ComponentType } from "@spicebench/core";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [statusText, setStatusText] = useState<string>("Ready");

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

  const updateStats = (c: CircuitProject) => {
    setStats({
      componentCount: c.components.length,
      wireCount: c.wires.length,
      junctionCount: c.junctions.length,
      instrumentCount: c.instruments.length,
    });
  };

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
        setSelectedId(comp.id);
        setStatusText(`Placed ${comp.type} '${comp.id}' at (${posX}, ${posY})`);
      } catch (err) {
        setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

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
      />

      {/* 3. Main ToolBar + Power Rocker Switch */}
      <ToolBar
        powerOn={powerOn}
        onTogglePower={handleTogglePower}
        onNew={handleNewCircuit}
        onValidate={handleValidate}
        onSimulate={handleSimulate}
      />

      {/* 4. Parts Bin Shelf */}
      <PartsBin onSelectComponent={handleSelectComponent} />

      {/* 5. Scalable & Pannable SVG Schematic Canvas */}
      <Canvas
        circuit={circuit}
        simulation={simulation}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCursorMove={setCursorPos}
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
