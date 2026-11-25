import React from "react";
import {
  IconNew,
  IconOpen,
  IconSave,
  IconPrint,
  IconCut,
  IconCopy,
  IconPaste,
  IconRotate,
  IconFlipH,
  IconFlipV,
  IconSubcircuit,
  IconGraphs,
  IconDescription,
  IconZoomOut,
  IconZoomIn,
  IconHelp,
} from "./EwbIcons";

interface ToolBarProps {
  powerOn: boolean;
  onTogglePower: () => void;
  onNew: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onValidate: () => void;
  onSimulate: () => void;
  onRotate?: () => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  canPaste?: boolean;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomChange?: (zoom: number) => void;
  onHelp?: () => void;
}

export const ToolBar: React.FC<ToolBarProps> = ({
  powerOn,
  onTogglePower,
  onNew,
  onOpen,
  onSave,
  onValidate,
  onSimulate,
  onRotate,
  onCut,
  onCopy,
  onPaste,
  canPaste,
  zoom = 1.0,
  onZoomIn,
  onZoomOut,
  onZoomChange,
  onHelp,
}) => {
  const zoomPct = Math.round(zoom * 100);
  const presetLevels = [50, 80, 100, 125, 150, 200];
  const selectValue = presetLevels.includes(zoomPct) ? `${zoomPct}%` : "custom";

  return (
    <div className="ewb-toolbar">
      {/* Left group: exact EWB 5.12 toolbar order (Image-1.jpeg) */}
      <div className="ewb-tool-group">
        <button className="ewb-tool-btn" title="New (Ctrl+N)" onClick={onNew}>
          <IconNew />
        </button>
        <button className="ewb-tool-btn" title="Open... (Ctrl+O)" onClick={onOpen}>
          <IconOpen />
        </button>
        <button className="ewb-tool-btn" title="Save (Ctrl+S)" onClick={onSave}>
          <IconSave />
        </button>
        <button className="ewb-tool-btn" title="Print" disabled>
          <IconPrint />
        </button>

        <div className="ewb-tool-divider" />

        <button className="ewb-tool-btn" title="Cut (Ctrl+X)" onClick={onCut}>
          <IconCut />
        </button>
        <button className="ewb-tool-btn" title="Copy (Ctrl+C)" onClick={onCopy}>
          <IconCopy />
        </button>
        <button
          className="ewb-tool-btn"
          title="Paste (Ctrl+V)"
          onClick={onPaste}
          disabled={canPaste === false}
        >
          <IconPaste />
        </button>

        <div className="ewb-tool-divider" />

        <button className="ewb-tool-btn" title="Rotate 90° (Ctrl+R)" onClick={onRotate}>
          <IconRotate />
        </button>
        <button className="ewb-tool-btn" title="Flip Horizontal" disabled>
          <IconFlipH />
        </button>
        <button className="ewb-tool-btn" title="Flip Vertical" disabled>
          <IconFlipV />
        </button>
        <button className="ewb-tool-btn" title="Create Subcircuit" disabled>
          <IconSubcircuit />
        </button>
        <button className="ewb-tool-btn" title="Analysis Graphs (Run Simulation)" onClick={onSimulate}>
          <IconGraphs />
        </button>

        <div className="ewb-tool-divider" />

        <button className="ewb-tool-btn" title="Circuit Description / Validate" onClick={onValidate}>
          <IconDescription />
        </button>

        <div className="ewb-tool-divider" />

        <button className="ewb-tool-btn" title="Zoom Out" onClick={onZoomOut}>
          <IconZoomOut />
        </button>
        <button className="ewb-tool-btn" title="Zoom In" onClick={onZoomIn}>
          <IconZoomIn />
        </button>
        <select
          className="ewb-zoom-select"
          value={selectValue}
          onChange={(e) => {
            const pct = parseInt(e.target.value, 10);
            if (!Number.isNaN(pct)) onZoomChange?.(pct / 100);
          }}
          title="Zoom Level"
          style={{ height: "22px", fontSize: "11px", marginLeft: "2px", width: "58px" }}
        >
          {!presetLevels.includes(zoomPct) && <option value="custom">{zoomPct}%</option>}
          <option value="50%">50%</option>
          <option value="80%">80%</option>
          <option value="100%">100%</option>
          <option value="125%">125%</option>
          <option value="150%">150%</option>
          <option value="200%">200%</option>
        </select>

        <div className="ewb-tool-divider" />

        <button className="ewb-tool-btn" title="Help" onClick={onHelp}>
          <IconHelp />
        </button>
      </div>

      {/* Right group: Classic EWB 5.12 Power Switch (O/I) + Pause underneath */}
      <div className="ewb-power-unit">
        <div
          className="ewb-rocker-switch"
          onClick={onTogglePower}
          title={powerOn ? "Power On (Click to turn Off)" : "Power Off (Click to turn On)"}
        >
          <div className={`ewb-rocker-half ${!powerOn ? "active" : "inactive"}`}>O</div>
          <div className={`ewb-rocker-half ${powerOn ? "active" : "inactive"}`}>I</div>
        </div>
        <button className="ewb-pause-btn" title="Pause Simulation" disabled={!powerOn}>
          Pause
        </button>
      </div>
    </div>
  );
};
