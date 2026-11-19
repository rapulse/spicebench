import React, { useRef, useEffect } from "react";
import type { OscilloscopeState, Component } from "@spicebench/core";
import type { SimulationSummary } from "@spicebench/mcp";

export interface OscilloscopePanelProps {
  component: Component;
  state: OscilloscopeState;
  simulation: SimulationSummary | null;
  onStateChange: (state: OscilloscopeState) => void;
}

export const OscilloscopePanel: React.FC<OscilloscopePanelProps> = ({
  component,
  state,
  simulation,
  onStateChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Parse timebase string (e.g. "1ms/div") into seconds per division
  const getTimebaseSec = (tb: string): number => {
    const match = tb.match(/([\d.]+)\s*([a-zA-Z]+)/);
    if (!match) return 0.001;
    const val = parseFloat(match[1] || "1");
    const unit = (match[2] || "").toLowerCase();
    if (unit.startsWith("u")) return val * 1e-6;
    if (unit.startsWith("m")) return val * 1e-3;
    return val;
  };

  // Parse volt scale (e.g. "5V/div") into volts per division
  const getVoltScale = (scaleStr: string): number => {
    const match = scaleStr.match(/([\d.]+)\s*([a-zA-Z]+)/);
    if (!match) return 5;
    const val = parseFloat(match[1] || "5");
    const unit = (match[2] || "").toLowerCase();
    if (unit.startsWith("m")) return val * 1e-3;
    return val;
  };

  // Draw CRT screen (10x8 divisions with phosphor waveforms)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. CRT Background
    ctx.fillStyle = "#0c1810";
    ctx.fillRect(0, 0, width, height);

    // 2. Graticule Grid (10 divisions horizontally, 8 divisions vertically)
    const xDivs = 10;
    const yDivs = 8;
    const dx = width / xDivs;
    const dy = height / yDivs;

    ctx.strokeStyle = "#1a3824";
    ctx.lineWidth = 1;

    for (let i = 1; i < xDivs; i++) {
      ctx.beginPath();
      ctx.moveTo(i * dx, 0);
      ctx.lineTo(i * dx, height);
      ctx.stroke();
    }
    for (let j = 1; j < yDivs; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * dy);
      ctx.lineTo(width, j * dy);
      ctx.stroke();
    }

    // Center axes with tick marks
    ctx.strokeStyle = "#2e603e";
    ctx.lineWidth = 1.5;
    const midX = width / 2;
    const midY = height / 2;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, height);
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // 3. Render Waveforms if Transient simulation data is available
    // Data comes pre-computed from the backend (ADR-011): differential A/B traces of THIS scope.
    const scope = simulation?.instruments?.[component.id];
    if (scope && scope.type === "OSCILLOSCOPE" && scope.status === "ok") {
      const variables: Record<string, number[]> = {};
      if (scope.chA) variables["chA"] = scope.chA;
      if (scope.chB) variables["chB"] = scope.chB;
      const tran = { time: scope.time, variables };
      {
        const timeArr = tran.time;
        const totalDuration = getTimebaseSec(state.timebase) * xDivs;
        const chAVoltsPerDiv = getVoltScale(state.chA.scale);
        const chBVoltsPerDiv = getVoltScale(state.chB.scale);

        const chAVarKey = scope.chA ? "chA" : undefined;
        const chBVarKey = scope.chB ? "chB" : undefined;

        // Draw Channel A (Red/Pink trace)
        if (state.chA.coupling !== "0" && chAVarKey && tran.variables[chAVarKey]) {
          const vals = tran.variables[chAVarKey]!;
          ctx.strokeStyle = "#ff4444";
          ctx.lineWidth = 1.8;
          ctx.beginPath();

          for (let i = 0; i < timeArr.length; i++) {
            const t = timeArr[i]! + state.xPos * (totalDuration / 10);
            const v = vals[i]! + state.chA.yPos * chAVoltsPerDiv;
            const px = (t / totalDuration) * width;
            const py = midY - (v / (chAVoltsPerDiv * yDivs)) * height;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }

        // Draw Channel B (Cyan/Blue trace)
        if (state.chB.coupling !== "0" && chBVarKey && tran.variables[chBVarKey]) {
          const vals = tran.variables[chBVarKey]!;
          ctx.strokeStyle = "#00ffff";
          ctx.lineWidth = 1.8;
          ctx.beginPath();

          for (let i = 0; i < timeArr.length; i++) {
            const t = timeArr[i]! + state.xPos * (totalDuration / 10);
            const v = vals[i]! + state.chB.yPos * chBVoltsPerDiv;
            const px = (t / totalDuration) * width;
            const py = midY - (v / (chBVoltsPerDiv * yDivs)) * height;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
    } else {
      // Idle flat traces when simulation is not running
      ctx.strokeStyle = "#408050";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
    }
  }, [component.id, simulation, state]);

  return (
    <div className="ewb-scope-panel" style={{ width: "360px", userSelect: "none" }}>
      {/* 1. CRT Display Screen */}
      <div
        style={{
          border: "2px inset #ffffff",
          background: "#0c1810",
          marginBottom: "8px",
          display: "flex",
          justifyContent: "center",
          boxShadow: "inset 2px 2px 6px rgba(0,0,0,0.6)",
        }}
      >
        <canvas ref={canvasRef} width={340} height={200} style={{ display: "block" }} />
      </div>

      {/* 2. Controls Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "6px",
          fontSize: "11px",
        }}
      >
        {/* Timebase */}
        <fieldset>
          <legend>Timebase</legend>
          <div style={{ marginBottom: "4px" }}>
            <span style={{ fontSize: "10px" }}>Scale:</span>
            <select
              className="ewb-dialog-select"
              style={{ width: "100%", fontSize: "10px" }}
              value={state.timebase}
              onChange={(e) => onStateChange({ ...state, timebase: e.target.value })}
            >
              <option value="10us/div">10 µs/div</option>
              <option value="100us/div">100 µs/div</option>
              <option value="1ms/div">1 ms/div</option>
              <option value="2ms/div">2 ms/div</option>
              <option value="5ms/div">5 ms/div</option>
              <option value="10ms/div">10 ms/div</option>
            </select>
          </div>
        </fieldset>

        {/* Channel A */}
        <fieldset>
          <legend style={{ color: "#b00000", fontWeight: "bold" }}>Channel A</legend>
          <div style={{ marginBottom: "4px" }}>
            <span style={{ fontSize: "10px" }}>Scale:</span>
            <select
              className="ewb-dialog-select"
              style={{ width: "100%", fontSize: "10px" }}
              value={state.chA.scale}
              onChange={(e) =>
                onStateChange({
                  ...state,
                  chA: { ...state.chA, scale: e.target.value },
                })
              }
            >
              <option value="1V/div">1 V/div</option>
              <option value="2V/div">2 V/div</option>
              <option value="5V/div">5 V/div</option>
              <option value="10V/div">10 V/div</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "2px" }}>
            {(["DC", "0", "AC"] as const).map((c) => (
              <button
                key={c}
                className={`ewb-tool-btn ${state.chA.coupling === c ? "active" : ""}`}
                style={{ flex: 1, padding: "1px 2px", fontSize: "10px" }}
                onClick={() =>
                  onStateChange({
                    ...state,
                    chA: { ...state.chA, coupling: c },
                  })
                }
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Channel B */}
        <fieldset>
          <legend style={{ color: "#0000b0", fontWeight: "bold" }}>Channel B</legend>
          <div style={{ marginBottom: "4px" }}>
            <span style={{ fontSize: "10px" }}>Scale:</span>
            <select
              className="ewb-dialog-select"
              style={{ width: "100%", fontSize: "10px" }}
              value={state.chB.scale}
              onChange={(e) =>
                onStateChange({
                  ...state,
                  chB: { ...state.chB, scale: e.target.value },
                })
              }
            >
              <option value="1V/div">1 V/div</option>
              <option value="2V/div">2 V/div</option>
              <option value="5V/div">5 V/div</option>
              <option value="10V/div">10 V/div</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "2px" }}>
            {(["DC", "0", "AC"] as const).map((c) => (
              <button
                key={c}
                className={`ewb-tool-btn ${state.chB.coupling === c ? "active" : ""}`}
                style={{ flex: 1, padding: "1px 2px", fontSize: "10px" }}
                onClick={() =>
                  onStateChange({
                    ...state,
                    chB: { ...state.chB, coupling: c },
                  })
                }
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
};
