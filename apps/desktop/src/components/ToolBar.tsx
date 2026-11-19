import React from "react";

interface ToolBarProps {
  powerOn: boolean;
  onTogglePower: () => void;
  onNew: () => void;
  onValidate: () => void;
  onSimulate: () => void;
  onRotate?: () => void;
}

export const ToolBar: React.FC<ToolBarProps> = ({
  powerOn,
  onTogglePower,
  onNew,
  onValidate,
  onSimulate,
}) => {
  return (
    <div className="ewb-toolbar">
      {/* Left group: file and edit buttons */}
      <div className="ewb-tool-group">
        <button className="ewb-tool-btn" title="New Circuit" onClick={onNew}>
          📄
        </button>
        <button className="ewb-tool-btn" title="Open...">
          📁
        </button>
        <button className="ewb-tool-btn" title="Save">
          💾
        </button>

        <div className="ewb-tool-divider" />

        <button className="ewb-tool-btn" title="Cut">
          ✂️
        </button>
        <button className="ewb-tool-btn" title="Copy">
          📋
        </button>
        <button className="ewb-tool-btn" title="Paste">
          📑
        </button>

        <div className="ewb-tool-divider" />

        <button className="ewb-tool-btn" title="Rotate (Ctrl+R)">
          🔄
        </button>
        <button className="ewb-tool-btn" title="Validate Topology" onClick={onValidate}>
          ✔️ Check
        </button>
        <button className="ewb-tool-btn" title="Run Simulation" onClick={onSimulate}>
          ⚡ Sim
        </button>
      </div>

      {/* Right group: Classic EWB Power Switch */}
      <div className="ewb-power-unit">
        <div className={`ewb-power-led ${powerOn ? "on" : ""}`} title={powerOn ? "Circuit Powered" : "Power Off"} />
        <div className="ewb-rocker-switch" onClick={onTogglePower} title="Power Rocker Switch (0/1)">
          <div className={`ewb-rocker-half ${powerOn ? "active" : "inactive"}`}>1</div>
          <div className={`ewb-rocker-half ${!powerOn ? "active" : "inactive"}`}>0</div>
        </div>
        <button className="ewb-tool-btn" title="Pause Simulation" disabled={!powerOn}>
          ⏸
        </button>
      </div>
    </div>
  );
};
