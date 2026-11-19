import React, { useState, useEffect } from "react";
import type { McpServerStatus, McpClientConfigMap } from "../types/ipc";

interface McpServerDialogProps {
  isOpen: boolean;
  status: McpServerStatus | null;
  onClose: () => void;
  onToggleServer: (enable: boolean, port?: number) => Promise<void>;
}

export const McpServerDialog: React.FC<McpServerDialogProps> = ({
  isOpen,
  status,
  onClose,
  onToggleServer,
}) => {
  const [activeTab, setActiveTab] = useState<"status" | "activity" | "clients">("status");
  const [targetPort, setTargetPort] = useState<string>("3100");
  const [selectedClient, setSelectedClient] = useState<"claude" | "cursor" | "antigravity">("claude");
  const [configs, setConfigs] = useState<McpClientConfigMap | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (status?.port) {
      setTargetPort(String(status.port));
    }
  }, [status?.port]);

  useEffect(() => {
    if (isOpen && window.spicebenchApi?.getMcpClientConfigs) {
      window.spicebenchApi.getMcpClientConfigs().then((c) => setConfigs(c));
    }
  }, [isOpen, status?.port]);

  if (!isOpen) return null;

  const isRunning = status?.running ?? false;
  const recentActions = status?.recentActions ?? [];

  const handleApplyPort = async () => {
    const p = parseInt(targetPort, 10);
    if (!isNaN(p) && p > 1024 && p < 65535) {
      await onToggleServer(true, p);
    }
  };

  const handleCopyConfig = async () => {
    if (!configs) return;
    const textToCopy =
      selectedClient === "claude"
        ? configs.claudeDesktop
        : selectedClient === "cursor"
        ? configs.cursor
        : configs.antigravity;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback("Copy failed");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="window"
        style={{
          width: "520px",
          maxWidth: "95vw",
          boxShadow: "4px 4px 10px rgba(0,0,0,0.5)",
        }}
      >
        <div className="title-bar">
          <div className="title-bar-text">Model Context Protocol (MCP) Server Settings</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={onClose} />
          </div>
        </div>

        <div className="window-body" style={{ margin: "10px" }}>
          {/* Win95 Tabs */}
          <menu role="tablist" style={{ margin: "0 0 10px 0", padding: 0 }}>
            <li
              role="tab"
              aria-selected={activeTab === "status"}
              onClick={() => setActiveTab("status")}
            >
              <a href="#status">Server Status</a>
            </li>
            <li
              role="tab"
              aria-selected={activeTab === "activity"}
              onClick={() => setActiveTab("activity")}
            >
              <a href="#activity">
                AI Activity Log {recentActions.length > 0 && `(${recentActions.length})`}
              </a>
            </li>
            <li
              role="tab"
              aria-selected={activeTab === "clients"}
              onClick={() => setActiveTab("clients")}
            >
              <a href="#clients">Client Configs</a>
            </li>
          </menu>

          {/* TAB 1: Server Status */}
          {activeTab === "status" && (
            <div>
              <fieldset style={{ marginBottom: "12px" }}>
                <legend>Service State</legend>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: isRunning ? "#00aa00" : "#cc0000",
                        boxShadow: isRunning ? "0 0 6px #00ff00" : "none",
                      }}
                    />
                    <strong style={{ fontSize: "13px" }}>
                      {isRunning ? "Running (Streamable HTTP / SSE)" : "Stopped"}
                    </strong>
                  </div>

                  <button
                    onClick={() => onToggleServer(!isRunning, parseInt(targetPort, 10))}
                    style={{ minWidth: "90px", fontWeight: "bold" }}
                  >
                    {isRunning ? "Stop Server" : "Start Server"}
                  </button>
                </div>

                <div className="field-row" style={{ marginTop: "10px" }}>
                  <label htmlFor="mcp-port" style={{ width: "90px" }}>Listen Port:</label>
                  <input
                    id="mcp-port"
                    type="number"
                    value={targetPort}
                    onChange={(e) => setTargetPort(e.target.value)}
                    style={{ width: "80px" }}
                  />
                  <button onClick={handleApplyPort} disabled={isRunning && Number(targetPort) === status?.port}>
                    Apply Port
                  </button>
                </div>

                <div className="field-row" style={{ marginTop: "8px" }}>
                  <label style={{ width: "90px" }}>SSE Endpoint:</label>
                  <input
                    type="text"
                    readOnly
                    value={status?.mcpUrl || `http://127.0.0.1:${targetPort}/mcp`}
                    style={{ flex: 1, backgroundColor: "#ffffff" }}
                  />
                </div>
              </fieldset>

              <fieldset>
                <legend>Protocol Capabilities</legend>
                <p style={{ margin: "4px 0", fontSize: "11px", color: "#333" }}>
                  The built-in MCP server exposes 8 foundational tools for AI models:
                </p>
                <ul style={{ margin: "4px 0 4px 18px", padding: 0, fontSize: "11px" }}>
                  <li><code>place_component</code>, <code>update_component</code>, <code>remove_component</code></li>
                  <li><code>connect_pins</code>, <code>validate_circuit</code>, <code>run_simulation</code></li>
                  <li><code>read_instrument</code>, <code>get_circuit_state</code>, <code>export_spice</code></li>
                </ul>
                <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#006600" }}>
                  ✓ Live two-way synchronization: any action by Claude/Antigravity renders on this canvas instantly.
                </p>
              </fieldset>
            </div>
          )}

          {/* TAB 2: AI Activity Log */}
          {activeTab === "activity" && (
            <div>
              <p style={{ margin: "0 0 6px 0", fontSize: "12px" }}>
                Recent actions performed by connected AI agents:
              </p>
              <div
                style={{
                  height: "210px",
                  overflowY: "auto",
                  background: "#ffffff",
                  border: "2px inset #ffffff",
                  padding: "4px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                }}
              >
                {recentActions.length === 0 ? (
                  <div style={{ color: "#777", padding: "10px", textAlign: "center" }}>
                    No AI agent activity recorded yet.
                    <br />
                    Connect an external MCP client (Claude Desktop, Cursor, Antigravity) to start automating.
                  </div>
                ) : (
                  recentActions.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        padding: "3px 4px",
                        borderBottom: "1px solid #eee",
                        display: "flex",
                        gap: "6px",
                      }}
                    >
                      <span style={{ color: "#888", minWidth: "60px" }}>
                        {new Date(act.timestamp).toLocaleTimeString()}
                      </span>
                      <strong style={{ color: "#003399", minWidth: "110px" }}>
                        [{act.tool}]
                      </strong>
                      <span style={{ color: "#111", wordBreak: "break-all" }}>
                        {act.description}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Client Configs */}
          {activeTab === "clients" && (
            <div>
              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                <button
                  className={selectedClient === "claude" ? "active" : ""}
                  onClick={() => setSelectedClient("claude")}
                  style={{ fontWeight: selectedClient === "claude" ? "bold" : "normal" }}
                >
                  Claude Desktop
                </button>
                <button
                  className={selectedClient === "cursor" ? "active" : ""}
                  onClick={() => setSelectedClient("cursor")}
                  style={{ fontWeight: selectedClient === "cursor" ? "bold" : "normal" }}
                >
                  Cursor IDE
                </button>
                <button
                  className={selectedClient === "antigravity" ? "active" : ""}
                  onClick={() => setSelectedClient("antigravity")}
                  style={{ fontWeight: selectedClient === "antigravity" ? "bold" : "normal" }}
                >
                  Antigravity CLI
                </button>
              </div>

              <textarea
                readOnly
                rows={9}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  backgroundColor: "#ffffff",
                  resize: "none",
                  boxSizing: "border-box",
                }}
                value={
                  !configs
                    ? "Loading configurations..."
                    : selectedClient === "claude"
                    ? configs.claudeDesktop
                    : selectedClient === "cursor"
                    ? configs.cursor
                    : configs.antigravity
                }
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                <span style={{ fontSize: "11px", color: copyFeedback ? "#008800" : "#666", fontWeight: "bold" }}>
                  {copyFeedback || (selectedClient === "claude" ? "Add to claude_desktop_config.json" : "Add to MCP configuration")}
                </span>
                <button onClick={handleCopyConfig} style={{ minWidth: "130px", fontWeight: "bold" }}>
                  Copy to Clipboard
                </button>
              </div>
            </div>
          )}

          {/* Dialog Action Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              marginTop: "14px",
              borderTop: "1px solid #dfdfdf",
              paddingTop: "8px",
            }}
          >
            <button onClick={onClose} style={{ minWidth: "80px" }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};