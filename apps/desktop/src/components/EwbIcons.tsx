import React from "react";

interface IconProps {
  size?: number;
}

const Svg: React.FC<{ size?: number; children: React.ReactNode }> = ({ size = 16, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: "block", flexShrink: 0 }}
  >
    {children}
  </svg>
);

/* --- Main Toolbar Icons (EWB 5.12 Image-1.jpeg) --- */

export const IconNew: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <path d="M3 1.5h7l3 3v10H3v-13z" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <path d="M10 1.5v3h3" fill="#c0c0c0" stroke="#000000" strokeWidth="1" />
  </Svg>
);

export const IconOpen: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <path d="M1.5 4.5h4l1.5 1.5h6.5v7.5h-12v-9z" fill="#e8d048" stroke="#000000" strokeWidth="1" />
    <path d="M1.5 7.5h10.5l2 6H3.5l-2-6z" fill="#f8e878" stroke="#000000" strokeWidth="1" />
  </Svg>
);

export const IconSave: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <rect x="2" y="2" width="12" height="12" fill="#202020" stroke="#000000" strokeWidth="1" />
    <rect x="4" y="2" width="7" height="4.5" fill="#d8d8d8" />
    <rect x="8.5" y="2.5" width="1.5" height="3" fill="#202020" />
    <rect x="4" y="8.5" width="8" height="5" fill="#ffffff" />
  </Svg>
);

export const IconPrint: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <rect x="4" y="2" width="8" height="4" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <rect x="2" y="6" width="12" height="6" fill="#c0c0c0" stroke="#000000" strokeWidth="1" />
    <rect x="4" y="10" width="8" height="4" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <line x1="5.5" y1="12" x2="10.5" y2="12" stroke="#404040" strokeWidth="1" />
  </Svg>
);

export const IconCut: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <circle cx="5" cy="12" r="2" stroke="#000080" strokeWidth="1.2" />
    <circle cx="11" cy="12" r="2" stroke="#000080" strokeWidth="1.2" />
    <line x1="6" y1="10.5" x2="11" y2="2.5" stroke="#000000" strokeWidth="1.2" />
    <line x1="10" y1="10.5" x2="5" y2="2.5" stroke="#000000" strokeWidth="1.2" />
  </Svg>
);

export const IconCopy: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <rect x="2" y="2" width="7.5" height="9" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <rect x="6.5" y="5" width="7.5" height="9" fill="#ffffff" stroke="#000080" strokeWidth="1" />
    <line x1="8" y1="8" x2="12" y2="8" stroke="#808080" strokeWidth="1" />
    <line x1="8" y1="10.5" x2="12" y2="10.5" stroke="#808080" strokeWidth="1" />
  </Svg>
);

export const IconPaste: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <rect x="2.5" y="3" width="9" height="11" fill="#a07030" stroke="#000000" strokeWidth="1" />
    <rect x="5" y="1.5" width="4" height="2.5" fill="#c0c0c0" stroke="#000000" strokeWidth="1" />
    <rect x="6" y="6" width="7.5" height="8" fill="#ffffff" stroke="#000080" strokeWidth="1" />
  </Svg>
);

export const IconRotate: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <polygon points="3,12 10,12 10,5" fill="#cc0000" stroke="#000000" strokeWidth="0.8" />
    <path d="M5 4.5A4.5 4.5 0 0 1 12.5 7" stroke="#000080" strokeWidth="1.2" fill="none" />
    <polygon points="12.5,8.5 10.5,6.5 14,6.5" fill="#000080" />
  </Svg>
);

export const IconFlipH: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <line x1="8" y1="2" x2="8" y2="14" stroke="#808080" strokeWidth="1" strokeDasharray="2 1" />
    <polygon points="2,12 6.5,12 6.5,4" fill="#cc0000" stroke="#000000" strokeWidth="0.8" />
    <polygon points="14,12 9.5,12 9.5,4" fill="#ffffff" stroke="#000000" strokeWidth="0.8" />
  </Svg>
);

export const IconFlipV: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <line x1="2" y1="8" x2="14" y2="8" stroke="#808080" strokeWidth="1" strokeDasharray="2 1" />
    <polygon points="4,2 12,6.5 4,6.5" fill="#cc0000" stroke="#000000" strokeWidth="0.8" />
    <polygon points="4,14 12,9.5 4,9.5" fill="#ffffff" stroke="#000000" strokeWidth="0.8" />
  </Svg>
);

export const IconSubcircuit: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <rect x="3" y="6" width="10" height="7" fill="#ffffff" stroke="#000080" strokeWidth="1" />
    <path d="M8 1.5v5.5M6 5l2 2 2-2" stroke="#000000" strokeWidth="1.2" fill="none" />
  </Svg>
);

export const IconGraphs: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <rect x="1.5" y="1.5" width="13" height="13" fill="#ffffff" stroke="#808080" strokeWidth="1" />
    <path d="M2.5 12 Q6 3 13.5 11" stroke="#cc0000" strokeWidth="1.2" fill="none" />
    <path d="M2.5 13 Q7 8 13.5 4" stroke="#0000cc" strokeWidth="1.2" fill="none" />
  </Svg>
);

export const IconDescription: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <rect x="2.5" y="2.5" width="9" height="11" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <line x1="4" y1="5.5" x2="9.5" y2="5.5" stroke="#808080" strokeWidth="1" />
    <line x1="4" y1="8" x2="9.5" y2="8" stroke="#808080" strokeWidth="1" />
    <line x1="8" y1="11" x2="14" y2="5" stroke="#cc8800" strokeWidth="2" />
  </Svg>
);

export const IconZoomOut: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <circle cx="6.5" cy="6.5" r="4.5" fill="#ffffff" stroke="#000080" strokeWidth="1.2" />
    <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="#000000" strokeWidth="1.2" />
    <line x1="10" y1="10" x2="14" y2="14" stroke="#000080" strokeWidth="2" />
  </Svg>
);

export const IconZoomIn: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <circle cx="6.5" cy="6.5" r="4.5" fill="#ffffff" stroke="#000080" strokeWidth="1.2" />
    <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="#000000" strokeWidth="1.2" />
    <line x1="6.5" y1="4.5" x2="6.5" y2="8.5" stroke="#000000" strokeWidth="1.2" />
    <line x1="10" y1="10" x2="14" y2="14" stroke="#000080" strokeWidth="2" />
  </Svg>
);

export const IconHelp: React.FC<IconProps> = ({ size }) => (
  <Svg size={size}>
    <text x="4" y="13" fill="#000080" fontSize="14" fontWeight="bold" fontFamily="serif">
      ?
    </text>
  </Svg>
);

/* --- Parts Bin Category Icons (14 bins in exact EWB 5.12 order) --- */

export const BinIconFavorites: React.FC = () => (
  <Svg size={18}>
    <rect x="2" y="3" width="6" height="10" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <path d="M10 8h6M12 6l-2 2 2 2" stroke="#000000" strokeWidth="1.2" />
  </Svg>
);

export const BinIconSources: React.FC = () => (
  <Svg size={18}>
    <line x1="9" y1="2" x2="9" y2="5" stroke="#000000" strokeWidth="1.2" />
    <line x1="4" y1="5" x2="14" y2="5" stroke="#000000" strokeWidth="1.2" />
    <line x1="6.5" y1="7.5" x2="11.5" y2="7.5" stroke="#000000" strokeWidth="1.8" />
    <line x1="4" y1="10" x2="14" y2="10" stroke="#000000" strokeWidth="1.2" />
    <line x1="6.5" y1="12.5" x2="11.5" y2="12.5" stroke="#000000" strokeWidth="1.8" />
    <line x1="9" y1="12.5" x2="9" y2="16" stroke="#000000" strokeWidth="1.2" />
  </Svg>
);

export const BinIconBasic: React.FC = () => (
  <Svg size={18}>
    <polyline
      points="1,9 4,9 5.5,5 7.5,13 9.5,5 11.5,13 13,9 17,9"
      stroke="#000000"
      strokeWidth="1.2"
      fill="none"
    />
  </Svg>
);

export const BinIconDiodes: React.FC = () => (
  <Svg size={18}>
    <line x1="2" y1="9" x2="6" y2="9" stroke="#000000" strokeWidth="1.2" />
    <polygon points="6,4.5 6,13.5 12,9" fill="none" stroke="#000000" strokeWidth="1.2" />
    <line x1="12" y1="4.5" x2="12" y2="13.5" stroke="#000000" strokeWidth="1.4" />
    <line x1="12" y1="9" x2="16" y2="9" stroke="#000000" strokeWidth="1.2" />
  </Svg>
);

export const BinIconTransistors: React.FC = () => (
  <Svg size={18}>
    <line x1="2" y1="9" x2="7" y2="9" stroke="#000000" strokeWidth="1.2" />
    <line x1="7" y1="4" x2="7" y2="14" stroke="#000000" strokeWidth="1.6" />
    <line x1="7" y1="7" x2="13" y2="3" stroke="#000000" strokeWidth="1.2" />
    <line x1="7" y1="11" x2="13" y2="15" stroke="#000000" strokeWidth="1.2" />
    <polygon points="13,15 10,14.5 11.5,12.5" fill="#000000" />
  </Svg>
);

export const BinIconAnalogIC: React.FC = () => (
  <Svg size={18}>
    <text x="1" y="7" fill="#000080" fontSize="6.5" fontWeight="bold">
      ANA
    </text>
    <rect x="4" y="9" width="10" height="7" fill="#ffffff" stroke="#000000" strokeWidth="1" />
  </Svg>
);

export const BinIconMixedIC: React.FC = () => (
  <Svg size={18}>
    <text x="0" y="7" fill="#000080" fontSize="5.5" fontWeight="bold">
      MIXED
    </text>
    <rect x="4" y="9" width="10" height="7" fill="#ffffff" stroke="#000000" strokeWidth="1" />
  </Svg>
);

export const BinIconDigitalIC: React.FC = () => (
  <Svg size={18}>
    <text x="0.5" y="7" fill="#000080" fontSize="5.5" fontWeight="bold">
      DIGIT
    </text>
    <rect x="4" y="9" width="10" height="7" fill="#ffffff" stroke="#000000" strokeWidth="1" />
  </Svg>
);

export const BinIconLogicGates: React.FC = () => (
  <Svg size={18}>
    <path d="M4 4h5a5 5 0 0 1 0 10H4V4z" fill="none" stroke="#000000" strokeWidth="1.2" />
    <line x1="1" y1="6.5" x2="4" y2="6.5" stroke="#000000" strokeWidth="1" />
    <line x1="1" y1="11.5" x2="4" y2="11.5" stroke="#000000" strokeWidth="1" />
    <line x1="14" y1="9" x2="17" y2="9" stroke="#000000" strokeWidth="1" />
  </Svg>
);

export const BinIconDigital: React.FC = () => (
  <Svg size={18}>
    <rect x="3" y="3" width="12" height="12" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <text x="4.5" y="9" fill="#000000" fontSize="5.5" fontWeight="bold">
      SQ
    </text>
    <text x="4.5" y="13.5" fill="#000000" fontSize="5.5" fontWeight="bold">
      RQ
    </text>
  </Svg>
);

export const BinIconIndicators: React.FC = () => (
  <Svg size={18}>
    <rect x="4" y="2" width="10" height="14" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <text x="6" y="13" fill="#cc0000" fontSize="11" fontWeight="bold" fontFamily="monospace">
      8
    </text>
  </Svg>
);

export const BinIconControls: React.FC = () => (
  <Svg size={18}>
    <rect x="3" y="3" width="12" height="12" fill="#ffffff" stroke="#000000" strokeWidth="1" />
    <text x="6.5" y="13" fill="#000000" fontSize="11" fontStyle="italic" fontWeight="bold">
      f
    </text>
  </Svg>
);

export const BinIconMisc: React.FC = () => (
  <Svg size={18}>
    <text x="3" y="14" fill="#000000" fontSize="13" fontWeight="bold">
      M
    </text>
  </Svg>
);

export const BinIconInstruments: React.FC = () => (
  <Svg size={18}>
    <rect x="2" y="3" width="14" height="11" fill="#d0d0d0" stroke="#000000" strokeWidth="1" />
    <rect x="4" y="5" width="7" height="6" fill="#ffffff" stroke="#000000" strokeWidth="0.8" />
    <path d="M4.5 8 Q6.5 5.5 8 8 T10.5 8" stroke="#008000" strokeWidth="1" fill="none" />
  </Svg>
);
