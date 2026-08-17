import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import type { GridDensity } from "../types";
import { Icon } from "./Icon";
import { debounce } from "../lib/util/misc";

const DENSITIES: { id: GridDensity; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "medium", label: "Medium" },
  { id: "detailed", label: "Detailed" },
];

const TAB_TITLES: Record<string, string> = {
  library: "Library",
  thisDay: "This Day",
  attributes: "Devices",
  duplicates: "Duplicates",
  places: "Places",
  themes: "Themes",
  settings: "Settings",
};

export function TopBar() {
  const setQuery = useStore((s) => s.setQuery);
  const query = useStore((s) => s.query);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const activeTab = useStore((s) => s.activeTab);
  const activeFilter = useStore((s) => s.activeFilter);
  const setFilter = useStore((s) => s.setFilter);
  const aiReady = useStore((s) => s.aiStatus.phase === "ready");

  const [local, setLocal] = useState(query);

  useEffect(() => setLocal(query), [query]);

  const [debounced] = useState(() => debounce((v: string) => setQuery(v), 220));

  let filterChip: string | null = null;
  if (activeFilter.kind === "favorites") filterChip = "Favorites";
  else if (activeFilter.kind !== "none") filterChip = activeFilter.value;

  return (
    <header className="topbar">
      <div className="topbar-title">
        {TAB_TITLES[activeTab] ?? "Library"}
        {filterChip && activeTab === "library" && (
          <button className="filter-chip" onClick={() => setFilter({ kind: "none" })}>
            {filterChip}
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      <div className="search-wrap">
        <Icon name="search" size={15} className="search-icon" />
        <input
          className="search-input"
          type="search"
          value={local}
          placeholder={aiReady ? "Search photos, places, people, or “sunset over a road”…" : "Search tags, dates, cities, devices…"}
          onChange={(e) => {
            setLocal(e.target.value);
            debounced(e.target.value);
          }}
        />
        {local && (
          <button
            className="search-clear"
            onClick={() => {
              setLocal("");
              setQuery("");
            }}
            aria-label="Clear search"
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      <div className="density-seg">
        {DENSITIES.map((d) => (
          <button
            key={d.id}
            className={density === d.id ? "active" : ""}
            onClick={() => setDensity(d.id)}
            title={d.label}
          >
            <Icon name="grid" size={14} strokeWidth={density === d.id ? 2 : 1.6} />
          </button>
        ))}
      </div>
    </header>
  );
}
