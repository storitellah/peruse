import { useRef } from "react";
import { useStore, canUseFsAccess } from "../state/store";
import { Icon } from "./Icon";

export function Welcome() {
  const importDirectory = useStore((s) => s.importDirectory);
  const importFiles = useStore((s) => s.importFiles);
  const scanning = useStore((s) => s.scanning);
  const scanFound = useStore((s) => s.scanFound);
  const inputRef = useRef<HTMLInputElement>(null);
  const fsAccess = canUseFsAccess();

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-glyph">
          <Icon name="photos" size={40} strokeWidth={1.5} />
        </div>
        <h1>Peruse</h1>
        <p className="welcome-tag">
          Organize, catalog, and archive your photos — entirely on your device.
        </p>

        <ul className="welcome-points">
          <li>
            <Icon name="lock" size={16} /> Nothing is uploaded. No cloud, no accounts.
          </li>
          <li>
            <Icon name="sparkles" size={16} /> On-device AI tagging and semantic search.
          </li>
          <li>
            <Icon name="layers" size={16} /> Find duplicates, keep the best shot.
          </li>
        </ul>

        {scanning ? (
          <div className="welcome-scanning">
            <span className="spinner" /> Scanning… {scanFound} photos found
          </div>
        ) : fsAccess ? (
          <button className="btn-primary lg" onClick={() => void importDirectory()}>
            <Icon name="folder" size={17} /> Choose a folder…
          </button>
        ) : (
          <>
            <button className="btn-primary lg" onClick={() => inputRef.current?.click()}>
              <Icon name="folder" size={17} /> Choose photos…
            </button>
            <p className="welcome-note">
              Your browser doesn't support in-place folder access, so Peruse will read
              the photos you pick in read-only mode. For full features (writing metadata
              in place), use a Chromium-based browser or the desktop build.
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          // @ts-expect-error non-standard but widely supported directory pick
          webkitdirectory=""
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.length) void importFiles(e.target.files);
          }}
        />

        <p className="welcome-privacy">
          Peruse reads your photos where they already live. It never copies, moves, or
          transmits them.
        </p>
      </div>
    </div>
  );
}
