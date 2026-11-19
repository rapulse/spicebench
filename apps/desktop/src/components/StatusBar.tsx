import React from "react";
import type { CircuitStats } from "@spicebench/mcp";

interface StatusBarProps {
  cursorPos: { x: number; y: number };
  statusText: string;
  stats: CircuitStats;
  powerOn: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  cursorPos,
  statusText,
  stats,
  powerOn,
}) => {
  return (
    <div className="ewb-status-bar">
      <div className="ewb-status-panel" style={{ minWidth: "90px" }}>
        X: {cursorPos.x}, Y: {cursorPos.y}
      </div>

      <div className="ewb-status-panel grow">
        {statusText}
      </div>

      <div className="ewb-status-panel" style={{ minWidth: "120px" }}>
        Parts: {stats.componentCount} | Wires: {stats.wireCount}
      </div>

      <div className="ewb-status-panel" style={{ minWidth: "140px" }}>
        <span style={{ color: powerOn ? "#008800" : "#666666", fontWeight: "bold" }}>
          ● {powerOn ? "RUNNING" : "STOPPED"}
        </span>
      </div>

      <div className="ewb-status-panel" style={{ minWidth: "130px" }}>
        MCP: 127.0.0.1:3100
      </div>
    </div>
  );
};
