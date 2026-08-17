import type { DeviceKind } from "../lib/devices/classify";

interface Props {
  kind: DeviceKind;
  size?: number;
  color?: string;
}

// Simple line-art silhouettes that read as the actual hardware: a notched
// iPhone, a home-button iPad, a Pixel with its camera bar, a Galaxy with a
// punch-hole, a generic Android, and a mirrorless/DSLR body.
export function DeviceGlyph({ kind, size = 26, color = "currentColor" }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "iphone":
      return (
        <svg {...common} aria-label="iPhone">
          <rect x="7" y="2.5" width="10" height="19" rx="2.6" />
          <path d="M10 4h4" />
        </svg>
      );
    case "ipad":
      return (
        <svg {...common} aria-label="iPad">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <circle cx="12" cy="18.6" r="0.7" fill={color} stroke="none" />
        </svg>
      );
    case "pixel":
      return (
        <svg {...common} aria-label="Pixel">
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
          <rect x="8.5" y="5" width="7" height="2.4" rx="1.2" />
        </svg>
      );
    case "galaxy":
      return (
        <svg {...common} aria-label="Samsung Galaxy">
          <rect x="6.5" y="2.2" width="11" height="19.6" rx="3" />
          <circle cx="12" cy="4.4" r="0.7" fill={color} stroke="none" />
        </svg>
      );
    case "android":
      return (
        <svg {...common} aria-label="Android phone">
          <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
          <path d="M10 18.5h4" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common} aria-label="Camera">
          <path d="M3.5 8.5a2 2 0 012-2h1.7l1.2-1.8h5.2L18 6.5h.5a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2v-8z" />
          <circle cx="12" cy="12.5" r="3.4" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-label="Device">
          <rect x="7" y="2.5" width="10" height="19" rx="2.6" />
          <path d="M10.5 19h3" />
        </svg>
      );
  }
}
