import React, { useRef, useEffect, useState } from "react";
import type { BodePlotterState, Component } from "@spicebench/core";
import type { SimulationSummary } from "@spicebench/mcp";

/** Adapter: backend Bode data -> { frequency, magnitudeDb: { h: series } } used by the drawing code. */
function bodeSeries(
  simulation: SimulationSummary | null,
  id: string,
  mode: BodePlotterState["mode"],
): { frequency: number[]; magnitudeDb: Record<string, number[]> } | null {
  const b = simulation?.instruments?.[id];
  if (!b || b.type !== "BODE_PLOTTER" || b.status !== "ok") return null;
  // TODO(ui): phase mode needs its own vertical scale (degrees), not vMin/vMax in dB.
  return { frequency: b.frequency, magnitudeDb: { h: mode === "phase" ? b.phaseDeg : b.magnitudeDb } };
}

export interface BodePlotterPanelProps {
  component: Component;
  state: BodePlotterState;
  simulation: SimulationSummary | null;
  onStateChange: (state: BodePlotterState) => void;
}

export const BodePlotterPanel: React.FC<BodePlotterPanelProps> = ({
  component,
  state,
  simulation,
  onStateChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursorInfo, setCursorInfo] = useState<{ freq: number; val: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Plotter Background
    ctx.fillStyle = "#0c1810";
    ctx.fillRect(0, 0, width, height);

    // 2. Grid lines
    ctx.strokeStyle = "#1b3824";
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo((i * width) / 10, 0);
      ctx.lineTo((i * width) / 10, height);
      ctx.stroke();
    }
    for (let j = 1; j < 6; j++) {
      ctx.beginPath();
      ctx.moveTo(0, (j * height) / 6);
      ctx.lineTo(width, (j * height) / 6);
      ctx.stroke();
    }

    // 3. Draw AC frequency response curve if AC simulation data is present
    // Data comes pre-computed from the backend (ADR-011): H = V(OUT)/V(IN) of THIS plotter.
    const ac = bodeSeries(simulation, component.id, state.mode);
    if (ac) {
      {
        const freqs = ac.frequency;
        const outKeys = Object.keys(ac.magnitudeDb);
        const outKey = outKeys[0];

        if (outKey && ac.magnitudeDb[outKey]) {
          const dbs = ac.magnitudeDb[outKey]!;
          const minDb = state.vMin;
          const maxDb = state.vMax;
          const logFMin = Math.log10(Math.max(1, freqs[0]!));
          const logFMax = Math.log10(Math.max(10, freqs[freqs.length - 1]!));

          ctx.strokeStyle = "#00ff88";
          ctx.lineWidth = 2;
          ctx.beginPath();

          for (let i = 0; i < freqs.length; i++) {
            const f = freqs[i]!;
            const db = dbs[i]!;
            const logF = Math.log10(Math.max(1, f));

            const px = ((logF - logFMin) / (logFMax - logFMin)) * width;
            const py = height - ((db - minDb) / (maxDb - minDb)) * height;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
    } else {
      // Idle response line
      ctx.strokeStyle = "#2e603e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }
  }, [simulation, state]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ac = bodeSeries(simulation, component.id, state.mode);
    if (!canvas || !ac) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / canvas.width));

    const freqs = ac.frequency;
    const logFMin = Math.log10(Math.max(1, freqs[0]!));
    const logFMax = Math.log10(Math.max(10, freqs[freqs.length - 1]!));
    const targetLogF = logFMin + ratio * (logFMax - logFMin);
    const targetF = Math.pow(10, targetLogF);

    const outKey = Object.keys(ac.magnitudeDb)[0];
    if (outKey && ac.magnitudeDb[outKey]) {
      const idx = Math.min(
        freqs.length - 1,
        Math.max(0, Math.round(ratio * (freqs.length - 1)))
      );
      setCursorInfo({
        freq: targetF,
        val: ac.magnitudeDb[outKey]![idx] ?? 0,
      });
    }
  };

  return (
    <div className="ewb-bode-panel" style={{ width: "360px", userSelect: "none" }}>
      {/* 1. Plot Display Screen */}
      <div
        style={{
          border: "2px inset #ffffff",
          background: "#0c1810",
          marginBottom: "8px",
          boxShadow: "inset 2px 2px 6px rgba(0,0,0,0.6)",
        }}
      >
        <canvas
          ref={canvasRef}
          width={340}
          height={160}
          style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setCursorInfo(null)}
        />
      </div>

      {/* 2. Cursor Readout */}
      <div
        style={{
          background: "#8ca88c",
          border: "1px inset #ffffff",
          padding: "4px 8px",
          fontFamily: "'Courier New', monospace",
          fontSize: "11px",
          fontWeight: "bold",
          marginBottom: "8px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          Freq: {cursorInfo ? `${cursorInfo.freq >= 1000 ? (cursorInfo.freq / 1000).toFixed(1) + " kHz" : cursorInfo.freq.toFixed(1) + " Hz"}` : "---"}
        </span>
        <span>
          Gain: {cursorInfo ? `${cursorInfo.val.toFixed(2)} dB` : "---"}
        </span>
      </div>

      {/* 3. Controls */}
      <div style={{ display: "flex", gap: "6px" }}>
        <fieldset style={{ flex: 1 }}>
          <legend>Mode</legend>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              className={`ewb-tool-btn ${state.mode === "magnitude" ? "active" : ""}`}
              style={{ flex: 1, fontSize: "10px" }}
              onClick={() => onStateChange({ ...state, mode: "magnitude" })}
            >
              Magnitude
            </button>
            <button
              className={`ewb-tool-btn ${state.mode === "phase" ? "active" : ""}`}
              style={{ flex: 1, fontSize: "10px" }}
              onClick={() => onStateChange({ ...state, mode: "phase" })}
            >
              Phase
            </button>
          </div>
        </fieldset>

        <fieldset style={{ flex: 1 }}>
          <legend>Vertical (dB)</legend>
          <div style={{ display: "flex", gap: "4px", fontSize: "10px", alignItems: "center" }}>
            <span>I: {state.vMin}</span>
            <span>F: {state.vMax}</span>
          </div>
        </fieldset>
      </div>
    </div>
  );
};
