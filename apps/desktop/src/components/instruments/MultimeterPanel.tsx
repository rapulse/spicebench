import React, { useState, useEffect } from "react";
import type { MultimeterState, Component } from "@spicebench/core";
import type { SimulationSummary, InstrumentReading } from "@spicebench/mcp";

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
  const [reading, setReading] = useState<string>(!simulation ? "0.000 V" : "---");

  // Fetch or calculate live reading whenever simulation results or mode changes
  useEffect(() => {
    if (!simulation) {
      setReading("0.000 " + (state.mode === "V" ? "V" : state.mode === "A" ? "A" : "Ω"));
      return;
    }

    if (window.spicebenchApi?.readInstrument) {
      window.spicebenchApi
        .readInstrument(component.id)
        .then((res: InstrumentReading) => {
          if (res && res.formatted) {
            setReading(res.formatted);
          }
        })
        .catch(() => {
          // Fallback to local pin voltage calculation if available
          const vPos = simulation.pinVoltages?.[`${component.id}:pos`] ?? 0;
          const vNeg = simulation.pinVoltages?.[`${component.id}:neg`] ?? 0;
          const diff = vPos - vNeg;
          const sign = diff >= 0 ? "+" : "";
          setReading(`${sign}${diff.toFixed(3)} V`);
        });
    } else if (simulation.pinVoltages) {
      const vPos = simulation.pinVoltages[`${component.id}:pos`] ?? 0;
      const vNeg = simulation.pinVoltages[`${component.id}:neg`] ?? 0;
      const diff = vPos - vNeg;
      const sign = diff >= 0 ? "+" : "";
      setReading(`${sign}${diff.toFixed(3)} V`);
    }
  }, [component.id, simulation, state.mode, state.currentType]);

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
