import React from "react";
import type { MultimeterState, Component } from "@spicebench/core";
import type { SimulationSummary } from "@spicebench/mcp";
import type { InstrumentData } from "@spicebench/sim";

export interface MultimeterPanelProps {
  component: Component;
  state: MultimeterState;
  simulation: SimulationSummary | null;
  onStateChange: (state: MultimeterState) => void;
}

export const MultimeterPanel: React.FC<MultimeterPanelProps> = ({
  component,
  state,
  simulation,
  onStateChange,
}) => {
  // Reading is computed in the backend from ngspice results (ADR-011); no local fallback math,
  // so the display never shows a fabricated 0 when the value cannot be measured.
  const reading = formatMultimeter(simulation?.instruments?.[component.id], state.mode);

  const handleModeChange = (mode: "V" | "A" | "R" | "dB") => {
    onStateChange({ ...state, mode });
  };

  const handleTypeChange = (currentType: "DC" | "AC") => {
    onStateChange({ ...state, currentType });
  };

  return (
    <div className="ewb-multimeter-panel" style={{ width: "260px", userSelect: "none" }}>
      {/* 1. Digital LCD Display */}
      <div
        className="ewb-meter-display"
        style={{
          background: "#8ca88c",
          border: "2px inset #ffffff",
          padding: "8px 12px",
          color: "#0a180a",
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: "20px",
          fontWeight: "bold",
          textAlign: "right",
          letterSpacing: "2px",
          marginBottom: "8px",
          boxShadow: "inset 1px 1px 4px rgba(0,0,0,0.4)",
        }}
      >
        {reading}
      </div>

      {/* 2. Control Buttons Grid */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
        {/* Mode selector */}
        <div style={{ display: "flex", flex: 2, gap: "2px" }}>
          <button
            className={`ewb-tool-btn ${state.mode === "V" ? "active" : ""}`}
            style={{ flex: 1, fontWeight: state.mode === "V" ? "bold" : "normal" }}
            onClick={() => handleModeChange("V")}
            title="Voltage (Volts)"
          >
            V
          </button>
          <button
            className={`ewb-tool-btn ${state.mode === "A" ? "active" : ""}`}
            style={{ flex: 1, fontWeight: state.mode === "A" ? "bold" : "normal" }}
            onClick={() => handleModeChange("A")}
            title="Current (Amperes)"
          >
            A
          </button>
          <button
            className={`ewb-tool-btn ${state.mode === "R" ? "active" : ""}`}
            style={{ flex: 1, fontWeight: state.mode === "R" ? "bold" : "normal" }}
            onClick={() => handleModeChange("R")}
            title="Resistance (Ohms)"
          >
            Ω
          </button>
          <button
            className={`ewb-tool-btn ${state.mode === "dB" ? "active" : ""}`}
            style={{ flex: 1, fontWeight: state.mode === "dB" ? "bold" : "normal" }}
            onClick={() => handleModeChange("dB")}
            title="Decibels"
          >
            dB
          </button>
        </div>

        {/* DC / AC Waveform selector */}
        <div style={{ display: "flex", flex: 1, gap: "2px" }}>
          <button
            className={`ewb-tool-btn ${state.currentType === "DC" ? "active" : ""}`}
            style={{ flex: 1, fontWeight: state.currentType === "DC" ? "bold" : "normal" }}
            onClick={() => handleTypeChange("DC")}
            title="Direct Current (DC)"
          >
            —
          </button>
          <button
            className={`ewb-tool-btn ${state.currentType === "AC" ? "active" : ""}`}
            style={{ flex: 1, fontWeight: state.currentType === "AC" ? "bold" : "normal" }}
            onClick={() => handleTypeChange("AC")}
            title="Alternating Current (AC RMS)"
          >
            ~
          </button>
        </div>
      </div>
    </div>
  );
};

const UNIT_LABEL: Record<string, string> = { V: "V", A: "A", R: "Ω", dB: "dB" };

function formatMultimeter(d: InstrumentData | undefined, mode: string): string {
  const unit = UNIT_LABEL[mode] ?? "V";
  if (!d || d.type !== "MULTIMETER") return `--- ${unit}`; // power off — never fabricate 0
  if (d.value === null) {
    if (d.status === "not_connected") return "----";
    if (d.status === "invalid") return "Err";
    return "---";
  }
  if (d.unit === "dB") return Number.isFinite(d.value) ? `${d.value.toFixed(2)} dB` : "-∞ dB";
  const a = Math.abs(d.value);
  const steps: Array<[number, string]> = [[1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"]];
  const [scale, p] = a === 0 ? [1, ""] : (steps.find(([s]) => a >= s) ?? [1e-9, "n"]);
  return `${(d.value / scale).toFixed(3)} ${p}${unit}`;
}
