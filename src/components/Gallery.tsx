import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore, selectVisible } from "../state/store";
import type { GridDensity, Photo } from "../types";
import { PhotoTile } from "./PhotoTile";
import { Icon } from "./Icon";

const TARGET_ROW_H: Record<GridDensity, number> = {
  compact: 132,
  medium: 208,
  detailed: 300,
};
const GAP = 6;

interface Positioned {
  photo: Photo;
  w: number;
  h: number;
}
interface Row {
  items: Positioned[];
  height: number;
}

/** Justified-rows (Flickr-style) layout that preserves each photo's aspect. */
function justify(photos: Photo[], containerW: number, targetH: number): Row[] {
  if (containerW <= 0) return [];
  const rows: Row[] = [];
  let cur: Photo[] = [];
  let arSum = 0;

  const flush = (isLast: boolean) => {
    if (!cur.length) return;
    const gaps = GAP * (cur.length - 1);
    const avail = containerW - gaps;
    let h = avail / arSum;
    // Don't upscale the final ragged row beyond the target height.
    if (isLast && h > targetH * 1.35) h = targetH;
    const items = cur.map((p) => {
      const ar = p.aspect || 1;
      return { photo: p, w: Math.max(1, ar * h), h };
    });
    rows.push({ items, height: h });
    cur = [];
    arSum = 0;
  };

  for (const p of photos) {
    cur.push(p);
    arSum += p.aspect || 1;
    const projectedH = (containerW - GAP * (cur.length - 1)) / arSum;
    if (projectedH <= targetH) flush(false);
  }
  flush(true);
  return rows;
}

export function Gallery() {
  const density = useStore((s) => s.density);
  const visible = useStore(selectVisible);
  const query = useStore((s) => s.query);

  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(
    () => justify(visible, width, TARGET_ROW_H[density]),
    [visible, width, density]
  );

  const groups = useMemo(() => groupByMonth(visible), [visible]);

  if (visible.length === 0) {
    return (
      <div className="empty-state">
        <Icon name={query ? "search" : "photos"} size={38} strokeWidth={1.3} />
        <p>{query ? "No photos match your search." : "No photos here yet."}</p>
      </div>
    );
  }

  return (
    <div className="gallery-scroll" ref={ref}>
      <div className="gallery-meta">
        {visible.length.toLocaleString()} photos
        {groups.span && ` · ${groups.span}`}
      </div>
      <div className="justified">
        {rows.map((row, ri) => (
          <div className="jrow" key={ri} style={{ height: row.height, gap: GAP }}>
            {row.items.map(({ photo, w, h }) => (
              <PhotoTile key={photo.id} photo={photo} width={w} height={h} density={density} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function groupByMonth(photos: Photo[]): { span: string | null } {
  if (!photos.length) return { span: null };
  const times = photos.map((p) => p.exif.takenAt ?? p.lastModified);
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const a = fmt(min);
  const b = fmt(max);
  return { span: a === b ? a : `${a} – ${b}` };
}
