import React from "react";
import type { FunctionGeneratorState, Component } from "@spicebench/core";

export interface FunctionGeneratorPanelProps {
  component: Component;
  state: FunctionGeneratorState;
  onStateChange: (state: FunctionGeneratorState) => void;
  onParamsChange?: (params: Record<string, string>) => void;
}

export const FunctionGeneratorPanel: React.FC<FunctionGeneratorPanelProps> = ({
  component: _component,
  state,
  onStateChange,
  onParamsChange,
}) => {
  const handleWaveformChange = (waveform: "sine" | "square" | "triangle") => {
    const updated = { ...state, waveform };
    onStateChange(updated);
    onParamsChange?.({ waveform });
  };

  const handleFrequencyChange = (freq: string) => {
    const updated = { ...state, frequency: freq };
    onStateChange(updated);
    onParamsChange?.({ frequency: freq });
  };

  const handleAmplitudeChange = (amp: string) => {
    const updated = { ...state, amplitude: amp };
    onStateChange(updated);
    onParamsChange?.({ voltage: amp, amplitude: amp });
  };

  const handleOffsetChange = (offset: string) => {
    const updated = { ...state, offset };
    onStateChange(updated);
    onParamsChange?.({ offset });
  };

  const handleDutyCycleChange = (duty: number) => {
    const updated = { ...state, dutyCycle: duty };
    onStateChange(updated);
    onParamsChange?.({ dutyCycle: String(duty) });
  };

  return (
    <div className="ewb-funcgen-panel" style={{ width: "280px", userSelect: "none" }}>
      {/* 1. Waveform selector */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
        <button
          className={`ewb-tool-btn ${state.waveform === "sine" ? "active" : ""}`}
          style={{ flex: 1, height: "28px", fontSize: "14px", fontWeight: "bold" }}
          onClick={() => handleWaveformChange("sine")}
          title="Sine Wave"
        >
          ∿ Sine
        </button>
        <button
          className={`ewb-tool-btn ${state.waveform === "triangle" ? "active" : ""}`}
          style={{ flex: 1, height: "28px", fontSize: "14px", fontWeight: "bold" }}
          onClick={() => handleWaveformChange("triangle")}
          title="Triangle Wave"
        >
          /\ Tri
        </button>
        <button
          className={`ewb-tool-btn ${state.waveform === "square" ? "active" : ""}`}
          style={{ flex: 1, height: "28px", fontSize: "14px", fontWeight: "bold" }}
          onClick={() => handleWaveformChange("square")}
          title="Square Wave"
        >
          ⎍ Square
        </button>
      </div>

      {/* 2. Controls fields */}
      <div style={{ border: "2px groove #ffffff", padding: "8px", background: "#c0c0c0" }}>
        <div className="ewb-dialog-row">
          <span className="ewb-dialog-label" style={{ width: "80px" }}>
            Frequency:
          </span>
          <input
            type="text"
            className="ewb-dialog-input"
            value={state.frequency}
            onChange={(e) => handleFrequencyChange(e.target.value)}
          />
        </div>

        <div className="ewb-dialog-row">
          <span className="ewb-dialog-label" style={{ width: "80px" }}>
            Duty Cycle:
          </span>
          <input
            type="number"
            min="1"
            max="99"
            className="ewb-dialog-input"
            value={state.dutyCycle}
            onChange={(e) => handleDutyCycleChange(Number(e.target.value) || 50)}
          />
          <span style={{ fontSize: "11px" }}>%</span>
        </div>

        <div className="ewb-dialog-row">
          <span className="ewb-dialog-label" style={{ width: "80px" }}>
            Amplitude:
          </span>
          <input
            type="text"
            className="ewb-dialog-input"
            value={state.amplitude}
            onChange={(e) => handleAmplitudeChange(e.target.value)}
          />
        </div>

        <div className="ewb-dialog-row">
          <span className="ewb-dialog-label" style={{ width: "80px" }}>
            Offset:
          </span>
          <input
            type="text"
            className="ewb-dialog-input"
            value={state.offset}
            onChange={(e) => handleOffsetChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
