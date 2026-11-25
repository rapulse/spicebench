import React, { useState } from "react";

interface InstrumentEntry {
  id: string;
  label: string;
  isOpen: boolean;
}

interface MenuBarProps {
  onNew: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onExportNetlist?: () => void;
  onImportNetlist?: () => void;
  onExit?: () => void;
  onOpenSample: (
    sample: "voltage-divider" | "rc-step" | "rlc-filter" | "interactive-logic"
  ) => void;
  onValidate: () => void;
  onSimulate: () => void;
  onActivate?: () => void;
  onStop?: () => void;
  onRotate?: () => void;
  onProperties?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  showNodeVoltages?: boolean;
  onToggleNodeVoltages?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenMcpDialog?: () => void;
  instruments?: InstrumentEntry[];
  onOpenInstrument?: (id: string) => void;
  onAbout?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  onNew,
  onOpen,
  onSave,
  onExportNetlist,
  onImportNetlist,
  onExit,
  onOpenSample,
  onValidate,
  onSimulate,
  onActivate,
  onStop,
  onRotate,
  onProperties,
  onZoomIn,
  onZoomOut,
  showGrid = true,
  onToggleGrid,
  showNodeVoltages = true,
  onToggleNodeVoltages,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onSelectAll,
  onUndo,
  onRedo,
  onOpenMcpDialog,
  instruments = [],
  onOpenInstrument,
  onAbout,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const toggleMenu = (menuName: string) => {
    setActiveMenu(activeMenu === menuName ? null : menuName);
  };

  const closeMenu = () => {
    setActiveMenu(null);
  };

  return (
    <div className="ewb-menu-bar" onMouseLeave={closeMenu}>
      {/* File Menu (EWB 5.12 order) */}
      <div className={`ewb-menu-item ${activeMenu === "file" ? "active" : ""}`} onClick={() => toggleMenu("file")}>
        File
        {activeMenu === "file" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={() => { onNew(); closeMenu(); }}>
              <span>New</span>
              <span>Ctrl+N</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onOpen?.(); closeMenu(); }}>
              <span>Open...</span>
              <span>Ctrl+O</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onSave?.(); closeMenu(); }}>
              <span>Save</span>
              <span>Ctrl+S</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onSave?.(); closeMenu(); }}>
              <span>Save As...</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onImportNetlist?.(); closeMenu(); }}>
              <span>Import SPICE (.cir)...</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onExportNetlist?.(); closeMenu(); }}>
              <span>Export SPICE (.cir)...</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onOpenSample("voltage-divider"); closeMenu(); }}>
              <span>Sample: Voltage Divider</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onOpenSample("rc-step"); closeMenu(); }}>
              <span>Sample: RC Transient</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onOpenSample("rlc-filter"); closeMenu(); }}>
              <span>Sample: RLC Resonance</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onOpenSample("interactive-logic"); closeMenu(); }}>
              <span>Sample: Digital Logic &amp; Bulb</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onExit?.(); closeMenu(); }}>
              <span>Exit</span>
              <span>Alt+F4</span>
            </div>
          </div>
        )}
      </div>

      {/* Edit Menu */}
      <div className={`ewb-menu-item ${activeMenu === "edit" ? "active" : ""}`} onClick={() => toggleMenu("edit")}>
        Edit
        {activeMenu === "edit" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={() => { onUndo?.(); closeMenu(); }}>
              <span>Undo</span>
              <span>Ctrl+Z</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onRedo?.(); closeMenu(); }}>
              <span>Redo</span>
              <span>Ctrl+Y</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onCut?.(); closeMenu(); }}>
              <span>Cut</span>
              <span>Ctrl+X</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onCopy?.(); closeMenu(); }}>
              <span>Copy</span>
              <span>Ctrl+C</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onPaste?.(); closeMenu(); }}>
              <span>Paste</span>
              <span>Ctrl+V</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onDelete?.(); closeMenu(); }}>
              <span>Delete</span>
              <span>Del</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onSelectAll?.(); closeMenu(); }}>
              <span>Select All</span>
              <span>Ctrl+A</span>
            </div>
          </div>
        )}
      </div>

      {/* Circuit Menu */}
      <div className={`ewb-menu-item ${activeMenu === "circuit" ? "active" : ""}`} onClick={() => toggleMenu("circuit")}>
        Circuit
        {activeMenu === "circuit" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={() => { onRotate?.(); closeMenu(); }}>
              <span>Rotate</span>
              <span>Ctrl+R</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onProperties?.(); closeMenu(); }}>
              <span>Component Properties...</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onZoomIn?.(); closeMenu(); }}>
              <span>Zoom In</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onZoomOut?.(); closeMenu(); }}>
              <span>Zoom Out</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onToggleGrid?.(); closeMenu(); }}>
              <span>{showGrid ? "✓ " : "  "}Show Grid</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onToggleNodeVoltages?.(); closeMenu(); }}>
              <span>{showNodeVoltages ? "✓ " : "  "}Show Node Voltages</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onValidate(); closeMenu(); }}>
              <span>Validate Topology...</span>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Menu */}
      <div className={`ewb-menu-item ${activeMenu === "analysis" ? "active" : ""}`} onClick={() => toggleMenu("analysis")}>
        Analysis
        {activeMenu === "analysis" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={() => { (onActivate ?? onSimulate)(); closeMenu(); }}>
              <span>Activate</span>
              <span>Ctrl+G</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onStop?.(); closeMenu(); }}>
              <span>Stop</span>
              <span>Ctrl+T</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onSimulate(); closeMenu(); }}>
              <span>Run All Required Analyses</span>
            </div>
          </div>
        )}
      </div>

      {/* Window Menu */}
      <div className={`ewb-menu-item ${activeMenu === "window" ? "active" : ""}`} onClick={() => toggleMenu("window")}>
        Window
        {activeMenu === "window" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={() => { onOpenMcpDialog?.(); closeMenu(); }}>
              <span>MCP Server Settings...</span>
              <span>Ctrl+M</span>
            </div>
            {instruments.length > 0 && <div className="ewb-dropdown-divider" />}
            {instruments.map((inst) => (
              <div
                key={inst.id}
                className="ewb-dropdown-item"
                onClick={() => { onOpenInstrument?.(inst.id); closeMenu(); }}
              >
                <span>{inst.isOpen ? "✓ " : "  "}{inst.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help Menu */}
      <div className={`ewb-menu-item ${activeMenu === "help" ? "active" : ""}`} onClick={() => toggleMenu("help")}>
        Help
        {activeMenu === "help" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={() => { onAbout?.(); closeMenu(); }}>
              <span>About Electronics Workbench / SpiceBench</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
