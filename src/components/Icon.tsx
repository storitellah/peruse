// Minimal, crisp SF-Symbols–flavoured icon set drawn as inline SVG strokes.
// Inline (no font, no network) keeps Peruse self-contained and theme-aware.

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export type IconName =
  | "photos"
  | "calendar"
  | "device"
  | "layers"
  | "map"
  | "sparkles"
  | "search"
  | "trash"
  | "close"
  | "chevronLeft"
  | "chevronRight"
  | "info"
  | "star"
  | "starFill"
  | "tag"
  | "person"
  | "location"
  | "folder"
  | "grid"
  | "rename"
  | "check"
  | "lock"
  | "gear";

const PATHS: Record<IconName, JSX.Element> = {
  photos: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="9" r="1.8" />
      <path d="M4 16l4.5-4 4 3.5L16 11l4 5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9h17M8 3v3M16 3v3" />
    </>
  ),
  device: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="3" />
      <path d="M11 18.5h2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3.5 12.5L12 17l8.5-4.5M3.5 16L12 20.5 20.5 16" />
    </>
  ),
  map: (
    <>
      <path d="M9 3.5L3.5 6v14.5L9 18l6 2.5 5.5-2.5V3.5L15 6 9 3.5z" />
      <path d="M9 3.5v14.5M15 6v14.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />,
  starFill: (
    <path
      d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9L12 3.5z"
      fill="currentColor"
    />
  ),
  tag: (
    <>
      <path d="M3.5 11.5l8-8H20V12l-8 8-8.5-8.5z" />
      <circle cx="16" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  location: (
    <>
      <path d="M12 21c4-4.5 7-8 7-11a7 7 0 10-14 0c0 3 3 6.5 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  folder: <path d="M3.5 6.5a2 2 0 012-2h4l2 2.2h7a2 2 0 012 2v9a2 2 0 01-2 2h-15a2 2 0 01-2-2v-11z" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  rename: (
    <>
      <path d="M4 20h16M4 16l10.5-10.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" />
    </>
  ),
};

export function Icon({ name, size = 18, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
