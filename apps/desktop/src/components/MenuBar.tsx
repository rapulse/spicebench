import React, { useState } from "react";

interface MenuBarProps {
  onNew: () => void;
  onOpenSample: (sample: "voltage-divider" | "rc-step" | "rlc-filter") => void;
  onValidate: () => void;
  onSimulate: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  onNew,
  onOpenSample,
  onValidate,
  onSimulate,
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
            <div className="ewb-dropdown-item" onClick={closeMenu}>
              <span>Undo</span>
              <span>Ctrl+Z</span>
            </div>
            <div className="ewb-dropdown-item" onClick={closeMenu}>
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
            <div className="ewb-dropdown-item" onClick={closeMenu}>
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
