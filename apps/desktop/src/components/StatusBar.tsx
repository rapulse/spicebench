import React from "react";
import type { CircuitStats } from "@spicebench/mcp";
import type { McpServerStatus } from "../types/ipc";

interface StatusBarProps {
  cursorPos: { x: number; y: number };
  statusText: string;
  stats: CircuitStats;
  powerOn: boolean;
  mcpStatus?: McpServerStatus | null;
  onOpenMcpDialog?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  cursorPos,
  statusText,
  stats,
  powerOn,
  mcpStatus,
  onOpenMcpDialog,
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

      <div
        className="ewb-status-panel"
        style={{
          minWidth: "140px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          userSelect: "none",
        }}
        onClick={onOpenMcpDialog}
        title="Click to view MCP Server Settings and Agent Activity Log"
      >
        <span
          style={{
            color: mcpStatus?.running ? "#00aa00" : "#888888",
            fontWeight: "bold",
          }}
        >
          ●
        </span>
        <span style={{ fontWeight: mcpStatus?.running ? "bold" : "normal" }}>
          MCP: {mcpStatus?.running ? `:${mcpStatus.port}` : "OFF"}
        </span>
        {mcpStatus?.recentActions && mcpStatus.recentActions.length > 0 && (
          <span
            style={{
              fontSize: "10px",
              backgroundColor: "#e0e0e0",
              border: "1px solid #999",
              borderRadius: "3px",
              padding: "0 4px",
            }}
          >
            {mcpStatus.recentActions.length}
          </span>
        )}
      </div>
    </div>
  );
};
