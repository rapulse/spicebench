import React, { useState, useEffect } from "react";
import type { Component } from "@spicebench/core";

export interface ComponentDialogProps {
  component: Component | null;
  isOpen: boolean;
  onSave: (id: string, updates: { label?: string; params: Record<string, string> }) => void;
  onClose: () => void;
}

type DialogTab = "value" | "label" | "specs";

export const ComponentDialog: React.FC<ComponentDialogProps> = ({
  component,
  isOpen,
  onSave,
  onClose,
}) => {
  if (!isOpen || !component) return null;

  const [activeTab, setActiveTab] = useState<DialogTab>("value");
  const [label, setLabel] = useState(component.label || component.id);
  const [params, setParams] = useState<Record<string, string>>({ ...component.params });

  // Sync state whenever opened component changes
  useEffect(() => {
    if (component) {
      setLabel(component.label || component.id);
      setParams({ ...component.params });
      setActiveTab("value");
    }
  }, [component]);

  const handleSave = () => {
    onSave(component.id, {
      label: label.trim() || component.id,
      params,
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const updateParam = (key: string, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const parseNumAndUnit = (val: string, defaultNum: string, defaultUnit: string) => {
    const match = val.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(.*)$/);
    const num = match && match[1] ? match[1] : defaultNum;
    const rawUnit = match && match[2] ? match[2].trim().toLowerCase() : defaultUnit;
    return { num, rawUnit };
  };

  const renderValueTab = () => {
    switch (component.type) {
      case "RESISTOR": {
        const currentVal = params["resistance"] || "1k";
        const { num, rawUnit } = parseNumAndUnit(currentVal, "1", "k");
        let unit = "k";
        if (rawUnit === "" || rawUnit === "ohm" || rawUnit === "ω" || rawUnit === "Ω") unit = "ohm";
        else if (rawUnit === "k" || rawUnit === "kohm" || rawUnit === "kω" || rawUnit === "kΩ") unit = "k";
        else if (rawUnit === "m" || rawUnit === "meg" || rawUnit === "mohm" || rawUnit === "mΩ") unit = "meg";

        const handleNumChange = (newNum: string) => {
          const suffix = unit === "ohm" ? "" : unit === "k" ? "k" : "meg";
          updateParam("resistance", `${newNum}${suffix}`);
        };

        const handleUnitChange = (newUnit: string) => {
          const suffix = newUnit === "ohm" ? "" : newUnit === "k" ? "k" : "meg";
          updateParam("resistance", `${num}${suffix}`);
        };

        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Resistance:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                style={{ width: "90px" }}
                value={num}
                onChange={(e) => handleNumChange(e.target.value)}
                autoFocus
              />
              <select
                className="ewb-dialog-select"
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value)}
              >
                <option value="ohm">Ω (Ohms)</option>
                <option value="k">kΩ (kOhms)</option>
                <option value="meg">MΩ (MegOhms)</option>
              </select>
            </div>
            <div className="ewb-dialog-row" style={{ marginTop: "8px", color: "#555" }}>
              <span className="ewb-dialog-label">Raw SPICE:</span>
              <span>{params["resistance"] || "1k"}</span>
            </div>
          </div>
        );
      }

      case "CAPACITOR":
      case "POLARIZED_CAPACITOR": {
        const currentVal = params["capacitance"] || "1uF";
        const { num, rawUnit } = parseNumAndUnit(currentVal, "1", "uf");
        let unit = "uf";
        if (rawUnit.startsWith("p")) unit = "pf";
        else if (rawUnit.startsWith("n")) unit = "nf";
        else if (rawUnit.startsWith("u") || rawUnit.startsWith("µ")) unit = "uf";
        else if (rawUnit.startsWith("m")) unit = "mf";
        else if (rawUnit.startsWith("f") || rawUnit === "") unit = "f";

        const handleNumChange = (newNum: string) => {
          updateParam("capacitance", `${newNum}${unit}`);
        };

        const handleUnitChange = (newUnit: string) => {
          updateParam("capacitance", `${num}${newUnit}`);
        };

        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Capacitance:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                style={{ width: "90px" }}
                value={num}
                onChange={(e) => handleNumChange(e.target.value)}
                autoFocus
              />
              <select
                className="ewb-dialog-select"
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value)}
              >
                <option value="pf">pF (Picofarads)</option>
                <option value="nf">nF (Nanofarads)</option>
                <option value="uf">µF (Microfarads)</option>
                <option value="mf">mF (Millifarads)</option>
                <option value="f">F (Farads)</option>
              </select>
            </div>
            <div className="ewb-dialog-row" style={{ marginTop: "8px", color: "#555" }}>
              <span className="ewb-dialog-label">Raw SPICE:</span>
              <span>{params["capacitance"] || "1uF"}</span>
            </div>
          </div>
        );
      }

      case "INDUCTOR": {
        const currentVal = params["inductance"] || "1mH";
        const { num, rawUnit } = parseNumAndUnit(currentVal, "1", "mh");
        let unit = "mh";
        if (rawUnit.startsWith("u") || rawUnit.startsWith("µ")) unit = "uh";
        else if (rawUnit.startsWith("m")) unit = "mh";
        else unit = "h";

        const handleNumChange = (newNum: string) => {
          updateParam("inductance", `${newNum}${unit}`);
        };

        const handleUnitChange = (newUnit: string) => {
          updateParam("inductance", `${num}${newUnit}`);
        };

        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Inductance:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                style={{ width: "90px" }}
                value={num}
                onChange={(e) => handleNumChange(e.target.value)}
                autoFocus
              />
              <select
                className="ewb-dialog-select"
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value)}
              >
                <option value="uh">µH (Microhenries)</option>
                <option value="mh">mH (Millihenries)</option>
                <option value="h">H (Henries)</option>
              </select>
            </div>
            <div className="ewb-dialog-row" style={{ marginTop: "8px", color: "#555" }}>
              <span className="ewb-dialog-label">Raw SPICE:</span>
              <span>{params["inductance"] || "1mH"}</span>
            </div>
          </div>
        );
      }

      case "DC_VOLTAGE_SOURCE": {
        const currentVal = params["voltage"] || "12V";
        const { num, rawUnit } = parseNumAndUnit(currentVal, "12", "v");
        let unit = "v";
        if (rawUnit.startsWith("m")) unit = "mv";
        else if (rawUnit.startsWith("k")) unit = "kv";
        else unit = "v";

        const handleNumChange = (newNum: string) => {
          updateParam("voltage", `${newNum}${unit}`);
        };

        const handleUnitChange = (newUnit: string) => {
          updateParam("voltage", `${num}${newUnit}`);
        };

        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Voltage:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                style={{ width: "90px" }}
                value={num}
                onChange={(e) => handleNumChange(e.target.value)}
                autoFocus
              />
              <select
                className="ewb-dialog-select"
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value)}
              >
                <option value="mv">mV (Millivolts)</option>
                <option value="v">V (Volts)</option>
                <option value="kv">kV (Kilovolts)</option>
              </select>
            </div>
          </div>
        );
      }

      case "AC_VOLTAGE_SOURCE": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Voltage (RMS):</span>
              <input
                type="text"
                className="ewb-dialog-input"
                value={params["voltage"] || "120V"}
                onChange={(e) => updateParam("voltage", e.target.value)}
                autoFocus
              />
            </div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Frequency:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                value={params["frequency"] || "60Hz"}
                onChange={(e) => updateParam("frequency", e.target.value)}
              />
            </div>
          </div>
        );
      }

      case "DC_CURRENT_SOURCE": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Current:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                value={params["current"] || "1A"}
                onChange={(e) => updateParam("current", e.target.value)}
                autoFocus
              />
            </div>
          </div>
        );
      }

      case "DIODE": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Diode Model:</span>
              <select
                className="ewb-dialog-select"
                value={params["model"] || "1N4148"}
                onChange={(e) => updateParam("model", e.target.value)}
                autoFocus
              >
                <option value="1N4148">1N4148 (Fast Switching)</option>
                <option value="1N4001">1N4001 (50V 1A Rectifier)</option>
                <option value="1N4007">1N4007 (1000V 1A Rectifier)</option>
                <option value="Default">Default Diode</option>
              </select>
            </div>
          </div>
        );
      }

      case "ZENER_DIODE": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Zener Vz:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                value={params["vz"] || "5.1V"}
                onChange={(e) => updateParam("vz", e.target.value)}
                autoFocus
              />
            </div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Model:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                value={params["model"] || "BZX55C5V1"}
                onChange={(e) => updateParam("model", e.target.value)}
              />
            </div>
          </div>
        );
      }

      case "LED": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">LED Color:</span>
              <select
                className="ewb-dialog-select"
                value={params["color"] || "red"}
                onChange={(e) => updateParam("color", e.target.value)}
                autoFocus
              >
                <option value="red">Red (Vf ≈ 1.8V)</option>
                <option value="green">Green (Vf ≈ 2.2V)</option>
                <option value="yellow">Yellow (Vf ≈ 2.1V)</option>
                <option value="blue">Blue (Vf ≈ 3.2V)</option>
              </select>
            </div>
          </div>
        );
      }

      case "BJT_NPN": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Transistor:</span>
              <select
                className="ewb-dialog-select"
                value={params["model"] || "2N3904"}
                onChange={(e) => updateParam("model", e.target.value)}
                autoFocus
              >
                <option value="2N3904">2N3904 (NPN General Purpose)</option>
                <option value="2N2222">2N2222 (NPN High Current)</option>
                <option value="BC547">BC547 (NPN Audio/General)</option>
                <option value="Default">Default NPN</option>
              </select>
            </div>
          </div>
        );
      }

      case "BJT_PNP": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Transistor:</span>
              <select
                className="ewb-dialog-select"
                value={params["model"] || "2N3906"}
                onChange={(e) => updateParam("model", e.target.value)}
                autoFocus
              >
                <option value="2N3906">2N3906 (PNP General Purpose)</option>
                <option value="2N2907">2N2907 (PNP High Current)</option>
                <option value="BC557">BC557 (PNP Audio/General)</option>
                <option value="Default">Default PNP</option>
              </select>
            </div>
          </div>
        );
      }

      case "OPAMP": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Op-Amp Model:</span>
              <select
                className="ewb-dialog-select"
                value={params["model"] || "LM741"}
                onChange={(e) => updateParam("model", e.target.value)}
                autoFocus
              >
                <option value="LM741">LM741 (Standard Op-Amp)</option>
                <option value="TL072">TL072 (Low Noise JFET)</option>
                <option value="Ideal">Ideal Op-Amp</option>
              </select>
            </div>
          </div>
        );
      }

      case "SWITCH_SPST": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Initial State:</span>
              <select
                className="ewb-dialog-select"
                value={params["state"] || "open"}
                onChange={(e) => updateParam("state", e.target.value)}
                autoFocus
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Key:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                value={params["key"] || "Space"}
                onChange={(e) => updateParam("key", e.target.value)}
              />
            </div>
          </div>
        );
      }

      case "POTENTIOMETER": {
        return (
          <div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Resistance:</span>
              <input
                type="text"
                className="ewb-dialog-input"
                value={params["resistance"] || "10k"}
                onChange={(e) => updateParam("resistance", e.target.value)}
                autoFocus
              />
            </div>
            <div className="ewb-dialog-row">
              <span className="ewb-dialog-label">Setting (%):</span>
              <input
                type="number"
                min="0"
                max="100"
                className="ewb-dialog-input"
                value={params["percent"] || "50"}
                onChange={(e) => updateParam("percent", e.target.value)}
              />
            </div>
          </div>
        );
      }

      case "GROUND": {
        return (
          <div style={{ padding: "8px 0", color: "#404040" }}>
            Ground reference (Node 0). This component does not have adjustable parameters.
          </div>
        );
      }

      default: {
        const paramKeys = Object.keys(params);
        if (paramKeys.length === 0) {
          return (
            <div style={{ padding: "8px 0", color: "#404040" }}>
              This component has no adjustable parameters.
            </div>
          );
        }

        return (
          <div>
            {paramKeys.map((key) => (
              <div key={key} className="ewb-dialog-row">
                <span className="ewb-dialog-label">{key}:</span>
                <input
                  type="text"
                  className="ewb-dialog-input"
                  value={params[key] || ""}
                  onChange={(e) => updateParam(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        );
      }
    }
  };

  const renderLabelTab = () => {
    return (
      <div>
        <div className="ewb-dialog-row">
          <span className="ewb-dialog-label">Component ID:</span>
          <span style={{ fontWeight: "bold" }}>{component.id}</span>
        </div>
        <div className="ewb-dialog-row">
          <span className="ewb-dialog-label">Label:</span>
          <input
            type="text"
            className="ewb-dialog-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </div>
      </div>
    );
  };

  const renderSpecsTab = () => {
    return (
      <div style={{ fontSize: "11px", lineHeight: "1.6" }}>
        <div><strong>Type:</strong> {component.type}</div>
        <div><strong>Position:</strong> ({component.position.x}, {component.position.y})</div>
        <div><strong>Rotation:</strong> {component.rotation}°</div>
      </div>
    );
  };

  return (
    <div className="ewb-modal-overlay" onClick={onClose}>
      <div
        className="window ewb-dialog-window"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="title-bar">
          <div className="title-bar-text">
            {component.label || component.id} Properties
          </div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={onClose} />
          </div>
        </div>

        <div className="window-body">
          <div className="ewb-dialog-tabs">
            <button
              type="button"
              className={`ewb-dialog-tab ${activeTab === "value" ? "active" : ""}`}
              onClick={() => setActiveTab("value")}
            >
              Value
            </button>
            <button
              type="button"
              className={`ewb-dialog-tab ${activeTab === "label" ? "active" : ""}`}
              onClick={() => setActiveTab("label")}
            >
              Label
            </button>
            <button
              type="button"
              className={`ewb-dialog-tab ${activeTab === "specs" ? "active" : ""}`}
              onClick={() => setActiveTab("specs")}
            >
              Specs
            </button>
          </div>

          <div className="ewb-dialog-content">
            {activeTab === "value" && renderValueTab()}
            {activeTab === "label" && renderLabelTab()}
            {activeTab === "specs" && renderSpecsTab()}
          </div>

          <div className="ewb-dialog-buttons">
            <button className="ewb-dialog-btn" onClick={handleSave} style={{ fontWeight: "bold" }}>
              OK
            </button>
            <button className="ewb-dialog-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
