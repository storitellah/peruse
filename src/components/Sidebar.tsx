import { useMemo, useRef, useState } from "react";
import { useStore, canUseFsAccess } from "../state/store";
import type { ActiveFilter } from "../state/store";
import type { TabId } from "../types";
import { Icon, type IconName } from "./Icon";
import { BackupSheet } from "./BackupSheet";

const NAV: { id: TabId; label: string; icon: IconName }[] = [
  { id: "library", label: "Library", icon: "photos" },
  { id: "thisDay", label: "This Day", icon: "calendar" },
  { id: "attributes", label: "Devices", icon: "device" },
  { id: "duplicates", label: "Duplicates", icon: "layers" },
];

export function Sidebar() {
  const photos = useStore((s) => s.photos);
  const activeTab = useStore((s) => s.activeTab);
  const setTab = useStore((s) => s.setTab);
  const activeFilter = useStore((s) => s.activeFilter);
  const setFilter = useStore((s) => s.setFilter);
  const dupCount = useStore((s) => s.duplicateGroups.length);
  const aiStatus = useStore((s) => s.aiStatus);
  const aiRunning = useStore((s) => s.aiRunning);
  const aiProgress = useStore((s) => s.aiProgress);
  const runAiTagging = useStore((s) => s.runAiTagging);
  const importDirectory = useStore((s) => s.importDirectory);
  const importFiles = useStore((s) => s.importFiles);
  const scanning = useStore((s) => s.scanning);
  const scanFound = useStore((s) => s.scanFound);
  const processed = useStore((s) => s.processed);
  const totalPhotos = useStore((s) => s.photos.length);

  const backupFrequency = useStore((s) => s.backupFrequency);
  const [backupOpen, setBackupOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Adding folders works whether or not the browser has the FS Access API.
  // With it we can re-open handles and write sidecars in place; without it we
  // fall through to a directory <input>. Either way photos load automatically.
  const addFolder = () => {
    if (canUseFsAccess()) void importDirectory();
    else inputRef.current?.click();
  };

  const live = useMemo(() => photos.filter((p) => !p.softDeleted), [photos]);

  const themes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of live) for (const t of p.aiTags) counts.set(t.label, (counts.get(t.label) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [live]);

  const places = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of live) {
      const c = p.exif.place?.country;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [live]);

  const favorites = useMemo(() => live.filter((p) => (p.iptc.rating ?? 0) >= 4).length, [live]);

  const isFilter = (f: ActiveFilter) =>
    activeTab === "library" &&
    activeFilter.kind === f.kind &&
    ("value" in f && "value" in activeFilter ? activeFilter.value === f.value : true);

  const goFilter = (f: ActiveFilter) => {
    setTab("library");
    setFilter(f);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-drag" />
      <div className="sidebar-scroll">
        <div className="sidebar-brand">
          <Icon name="photos" size={19} strokeWidth={1.6} />
          <span>Peruse</span>
        </div>

        <nav className="side-group">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`side-row ${activeTab === n.id ? "active" : ""}`}
              onClick={() => {
                setTab(n.id);
                if (n.id === "library") setFilter({ kind: "none" });
              }}
            >
              <Icon name={n.icon} size={17} />
              <span>{n.label}</span>
              {n.id === "library" && <span className="side-count">{live.length}</span>}
              {n.id === "duplicates" && dupCount > 0 && <span className="side-count">{dupCount}</span>}
            </button>
          ))}
          <button
            className={`side-row ${isFilter({ kind: "favorites" }) ? "active" : ""}`}
            onClick={() => goFilter({ kind: "favorites" })}
          >
            <Icon name="starFill" size={16} />
            <span>Favorites</span>
            {favorites > 0 && <span className="side-count">{favorites}</span>}
          </button>
        </nav>

        <div className="side-section">
          <div className="side-heading">On-Device Vision</div>
          <div className="ai-card">
            {aiStatus.phase === "ready" ? (
              <div className="ai-status ok">
                <Icon name="check" size={14} /> Model ready
              </div>
            ) : aiStatus.phase === "loading" ? (
              <div className="ai-status">
                <span className="spinner sm" /> {aiStatus.note}
              </div>
            ) : aiStatus.phase === "unavailable" ? (
              <div className="ai-status warn" title={aiStatus.reason}>
                Vision offline
              </div>
            ) : (
              <div className="ai-status muted">CLIP · runs locally</div>
            )}
            <button className="btn-mini" disabled={aiRunning} onClick={() => void runAiTagging()}>
              <Icon name="sparkles" size={14} />
              {aiRunning ? `Tagging ${aiProgress}%` : "Auto-tag photos"}
            </button>
            {aiRunning && (
              <div className="progress">
                <div className="progress-fill" style={{ width: `${aiProgress}%` }} />
              </div>
            )}
          </div>
        </div>

        {themes.length > 0 && (
          <div className="side-section">
            <div className="side-heading">Themes</div>
            {themes.map(([label, count]) => (
              <button
                key={label}
                className={`side-row sm ${isFilter({ kind: "theme", value: label }) ? "active" : ""}`}
                onClick={() => goFilter({ kind: "theme", value: label })}
              >
                <Icon name="sparkles" size={15} />
                <span>{label}</span>
                <span className="side-count">{count}</span>
              </button>
            ))}
          </div>
        )}

        {places.length > 0 && (
          <div className="side-section">
            <div className="side-heading">Places</div>
            {places.map(([label, count]) => (
              <button
                key={label}
                className={`side-row sm ${isFilter({ kind: "country", value: label }) ? "active" : ""}`}
                onClick={() => goFilter({ kind: "country", value: label })}
              >
                <Icon name="location" size={15} />
                <span>{label}</span>
                <span className="side-count">{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="side-section">
          <button className="side-row sm add" onClick={addFolder} disabled={scanning}>
            <Icon name="folder" size={15} />
            <span>Add another folder…</span>
          </button>
          {(scanning || processed < totalPhotos) && (
            <div className="import-status">
              <span className="spinner sm" />
              {scanning
                ? `Scanning… ${scanFound} found`
                : `Loading ${processed}/${totalPhotos}`}
            </div>
          )}
          <button className="side-row sm add" onClick={() => setBackupOpen(true)}>
            <Icon name="lock" size={15} />
            <span>Backup catalog…</span>
            {backupFrequency !== "off" && <span className="side-count">{backupFrequency}</span>}
          </button>
          <button
            className={`side-row sm ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            <Icon name="gear" size={15} />
            <span>Settings</span>
          </button>
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
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}
    </aside>
  );
}
