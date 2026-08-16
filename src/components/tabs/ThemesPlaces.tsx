import { useMemo } from "react";
import { useStore } from "../../state/store";
import { LABELS } from "../../lib/ai/labels";
import { Icon } from "../Icon";

/** Collection wall for AI themes and location hierarchies. */
export function ThemesPlaces() {
  const activeTab = useStore((s) => s.activeTab);
  const photos = useStore((s) => s.photos);
  const setTab = useStore((s) => s.setTab);
  const setFilter = useStore((s) => s.setFilter);

  const live = useMemo(() => photos.filter((p) => !p.softDeleted), [photos]);

  const collections = useMemo(() => {
    if (activeTab === "themes") {
      const groups = new Map<string, { count: number; cover?: string }>();
      for (const l of LABELS) groups.set(l.label, { count: 0 });
      for (const p of live) {
        for (const t of p.aiTags) {
          const g = groups.get(t.label) ?? { count: 0 };
          g.count += 1;
          if (!g.cover && p.thumbUrl) g.cover = p.thumbUrl;
          groups.set(t.label, g);
        }
      }
      return [...groups.entries()]
        .filter(([, g]) => g.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([label, g]) => ({ label, count: g.count, cover: g.cover, kind: "theme" as const }));
    }
    // places
    const groups = new Map<string, { count: number; cover?: string }>();
    for (const p of live) {
      const city = p.exif.place?.city;
      if (!city) continue;
      const g = groups.get(city) ?? { count: 0 };
      g.count += 1;
      if (!g.cover && p.thumbUrl) g.cover = p.thumbUrl;
      groups.set(city, g);
    }
    return [...groups.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, g]) => ({ label, count: g.count, cover: g.cover, kind: "city" as const }));
  }, [live, activeTab]);

  if (collections.length === 0) {
    return (
      <div className="empty-state">
        <Icon name={activeTab === "themes" ? "sparkles" : "map"} size={38} strokeWidth={1.3} />
        <p>
          {activeTab === "themes"
            ? "Run on-device tagging to build theme collections."
            : "No geotagged photos to place on the map yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="gallery-scroll">
      <div className="coll-grid">
        {collections.map((c) => (
          <button
            key={c.label}
            className="coll-card"
            onClick={() => {
              setTab("library");
              setFilter(c.kind === "theme" ? { kind: "theme", value: c.label } : { kind: "city", value: c.label });
            }}
          >
            <div className="coll-cover">
              {c.cover ? <img src={c.cover} alt="" /> : <Icon name={c.kind === "theme" ? "sparkles" : "location"} size={26} />}
              <div className="coll-scrim" />
            </div>
            <div className="coll-meta">
              <span className="coll-label">{c.label}</span>
              <span className="coll-count">{c.count}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
