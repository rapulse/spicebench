import React, { useState } from "react";

interface MenuBarProps {
  onNew: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onExportNetlist?: () => void;
  onOpenSample: (sample: "voltage-divider" | "rc-step" | "rlc-filter") => void;
  onValidate: () => void;
  onSimulate: () => void;
  onRotate?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenMcpDialog?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  onNew,
  onOpen,
  onSave,
  onExportNetlist,
  onOpenSample,
  onValidate,
  onSimulate,
  onRotate,
  onDelete,
  onSelectAll,
  onUndo,
  onRedo,
  onOpenMcpDialog,
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
      {/* File Menu */}
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
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onExportNetlist?.(); closeMenu(); }}>
              <span>Export SPICE Netlist (.cir)...</span>
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
            <div className="ewb-dropdown-item" onClick={closeMenu}>
              <span>Cut</span>
              <span>Ctrl+X</span>
            </div>
            <div className="ewb-dropdown-item" onClick={closeMenu}>
              <span>Copy</span>
              <span>Ctrl+C</span>
            </div>
            <div className="ewb-dropdown-item" onClick={closeMenu}>
              <span>Paste</span>
              <span>Ctrl+V</span>
            </div>
            <div className="ewb-dropdown-divider" />
            <div className="ewb-dropdown-item" onClick={() => { onDelete?.(); closeMenu(); }}>
              <span>Delete</span>
              <span>Del</span>
            </div>
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
            <div className="ewb-dropdown-item" onClick={() => { onValidate(); closeMenu(); }}>
              <span>Validate Topology...</span>
            </div>
            <div className="ewb-dropdown-item" onClick={() => { onRotate?.(); closeMenu(); }}>
              <span>Rotate 90°</span>
              <span>Ctrl+R</span>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Menu */}
      <div className={`ewb-menu-item ${activeMenu === "analysis" ? "active" : ""}`} onClick={() => toggleMenu("analysis")}>
        Analysis
        {activeMenu === "analysis" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={() => { onSimulate(); closeMenu(); }}>
              <span>Operating Point (.op)</span>
            </div>
            <div className="ewb-dropdown-item" onClick={closeMenu}>
              <span>Transient (.tran)</span>
            </div>
            <div className="ewb-dropdown-item" onClick={closeMenu}>
              <span>AC Frequency Sweep (.ac)</span>
            </div>
          </div>
        )}
      </div>

      {/* Tools Menu */}
      <div className={`ewb-menu-item ${activeMenu === "tools" ? "active" : ""}`} onClick={() => toggleMenu("tools")}>
        Tools
        {activeMenu === "tools" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={() => { onOpenMcpDialog?.(); closeMenu(); }}>
              <span>MCP Server Settings...</span>
              <span>Ctrl+M</span>
            </div>
          </div>
        )}
      </div>

      {/* Help Menu */}
      <div className={`ewb-menu-item ${activeMenu === "help" ? "active" : ""}`} onClick={() => toggleMenu("help")}>
        Help
        {activeMenu === "help" && (
          <div className="ewb-menu-dropdown">
            <div className="ewb-dropdown-item" onClick={closeMenu}>
              <span>About SpiceBench 5.12</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
