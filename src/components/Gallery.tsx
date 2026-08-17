import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
const OVERSCAN_PX = 800; // decode/render a little beyond the viewport

interface Positioned {
  photo: Photo;
  w: number;
  h: number;
}
interface Row {
  items: Positioned[];
  height: number;
  top: number;
}

/** Justified-rows layout that preserves each photo's aspect ratio, with
 *  cumulative row offsets so the grid can be virtualized for 100k+ photos. */
function justify(photos: Photo[], containerW: number, targetH: number): { rows: Row[]; total: number } {
  if (containerW <= 0 || !photos.length) return { rows: [], total: 0 };
  const rows: Row[] = [];
  let cur: Photo[] = [];
  let arSum = 0;
  let top = 0;

  const flush = (isLast: boolean) => {
    if (!cur.length) return;
    const gaps = GAP * (cur.length - 1);
    const avail = containerW - gaps;
    let h = avail / arSum;
    if (isLast && h > targetH * 1.35) h = targetH;
    const items = cur.map((p) => ({ photo: p, w: Math.max(1, (p.aspect || 1) * h), h }));
    rows.push({ items, height: h, top });
    top += h + GAP;
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
  return { rows, total: top };
}

/** Throttled snapshot of the visible set — recomputed at most ~5×/sec so that
 *  frequent thumbnail patches during a large import don't re-sort on every tick. */
function useVisible(): Photo[] {
  const [snap, setSnap] = useState(() => selectVisible(useStore.getState()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    const schedule = () => {
      if (timer) return;
      const wait = Math.max(0, 180 - (Date.now() - last));
      timer = setTimeout(() => {
        timer = undefined;
        last = Date.now();
        setSnap(selectVisible(useStore.getState()));
      }, wait);
    };
    const unsub = useStore.subscribe(schedule);
    schedule();
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return snap;
}

export function Gallery() {
  const density = useStore((s) => s.density);
  const query = useStore((s) => s.query);
  const visible = useVisible();

  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
      setViewH(el.clientHeight);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const { rows, total } = useMemo(
    () => justify(visible, width, TARGET_ROW_H[density]),
    [visible, width, density]
  );

  // Virtualize: render only rows intersecting the viewport (+ overscan).
  const firstIdx = useMemo(() => {
    const y = scrollTop - OVERSCAN_PX;
    let lo = 0;
    let hi = rows.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].top + rows[mid].height >= y) {
        ans = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return ans;
  }, [rows, scrollTop]);

  const lastIdx = useMemo(() => {
    const y = scrollTop + viewH + OVERSCAN_PX;
    let i = firstIdx;
    while (i < rows.length && rows[i].top <= y) i++;
    return Math.min(rows.length, i);
  }, [rows, scrollTop, viewH, firstIdx]);

  // Keyboard navigation: arrow keys move the selection through the grid
  // (left/right = prev/next, up/down = row), Enter opens the full preview.
  const select = useStore((s) => s.select);
  const openLightbox = useStore((s) => s.openLightbox);

  const posById = useMemo(() => {
    const m = new Map<string, { r: number; c: number }>();
    rows.forEach((row, r) => row.items.forEach((it, c) => m.set(it.photo.id, { r, c })));
    return m;
  }, [rows]);

  useEffect(() => {
    const scrollRowIntoView = (r: number) => {
      const el = ref.current;
      if (!el || !rows[r]) return;
      const { top, height } = rows[r];
      if (top < el.scrollTop + 8) el.scrollTo({ top: Math.max(0, top - 12), behavior: "smooth" });
      else if (top + height > el.scrollTop + el.clientHeight - 8)
        el.scrollTo({ top: top + height - el.clientHeight + 12, behavior: "smooth" });
    };
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (st.lightboxId || st.activeTab !== "library") return; // lightbox/other tabs handle their own
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) return;
      if (!rows.length) return;
      e.preventDefault();
      const curId = st.selectedId;
      if (e.key === "Enter") {
        if (curId) openLightbox(curId);
        return;
      }
      let target: string | undefined;
      const pos = curId ? posById.get(curId) : undefined;
      if (!pos) {
        target = rows[0].items[0].photo.id;
      } else {
        let { r, c } = pos;
        if (e.key === "ArrowLeft") {
          if (c > 0) c--;
          else if (r > 0) {
            r--;
            c = rows[r].items.length - 1;
          }
        } else if (e.key === "ArrowRight") {
          if (c < rows[r].items.length - 1) c++;
          else if (r < rows.length - 1) {
            r++;
            c = 0;
          }
        } else if (e.key === "ArrowUp" && r > 0) {
          r--;
          c = Math.min(c, rows[r].items.length - 1);
        } else if (e.key === "ArrowDown" && r < rows.length - 1) {
          r++;
          c = Math.min(c, rows[r].items.length - 1);
        }
        target = rows[r].items[c].photo.id;
      }
      if (target) {
        select(target);
        scrollRowIntoView(posById.get(target)?.r ?? 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, posById, select, openLightbox]);

  const rafRef = useRef(0);
  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (ref.current) setScrollTop(ref.current.scrollTop);
    });
  };

  const meta = useMemo(() => spanLabel(visible), [visible]);

  if (visible.length === 0) {
    return (
      <div className="empty-state">
        <Icon name={query ? "search" : "photos"} size={38} strokeWidth={1.3} />
        <p>{query ? "No photos match your search." : "No photos here yet."}</p>
      </div>
    );
  }

  return (
    <div className="gallery-scroll" ref={ref} onScroll={onScroll}>
      <div className="gallery-meta">
        {visible.length.toLocaleString()} photos{meta ? ` · ${meta}` : ""}
      </div>
      <div className="justified" style={{ height: total, position: "relative" }}>
        {rows.slice(firstIdx, lastIdx).map((row, i) => (
          <div
            className="jrow"
            key={firstIdx + i}
            style={{ position: "absolute", top: row.top, left: 0, right: 0, height: row.height, gap: GAP }}
          >
            {row.items.map(({ photo, w, h }) => (
              <PhotoTile key={photo.id} photo={photo} width={w} height={h} density={density} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function spanLabel(photos: Photo[]): string | null {
  if (!photos.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of photos) {
    const t = p.exif.takenAt ?? p.lastModified;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const fmt = (d: number) => new Date(d).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const a = fmt(min);
  const b = fmt(max);
  return a === b ? a : `${a} – ${b}`;
}
