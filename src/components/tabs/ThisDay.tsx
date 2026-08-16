import { useMemo } from "react";
import { useStore } from "../../state/store";
import { PhotoTile } from "../PhotoTile";
import { Icon } from "../Icon";
import { monthDayLabel } from "../../lib/util/misc";

/** Flashback feed: photos taken on today's calendar day across past years. */
export function ThisDay() {
  const photos = useStore((s) => s.photos);

  const { todayLabel, byYear } = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const d = now.getDate();
    const groups = new Map<number, typeof photos>();
    for (const p of photos) {
      if (p.softDeleted || !p.exif.takenAt) continue;
      const t = new Date(p.exif.takenAt);
      if (t.getMonth() === m && t.getDate() === d && t.getFullYear() !== now.getFullYear()) {
        const y = t.getFullYear();
        const list = groups.get(y) ?? [];
        list.push(p);
        groups.set(y, list);
      }
    }
    const byYear = [...groups.entries()].sort((a, b) => b[0] - a[0]);
    return { todayLabel: monthDayLabel(now.getTime()), byYear };
  }, [photos]);

  if (byYear.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="calendar" size={38} strokeWidth={1.3} />
        <p>No memories from {todayLabel} in earlier years — yet.</p>
      </div>
    );
  }

  return (
    <div className="gallery-scroll">
      <div className="thisday-hero">
        <div className="thisday-date">{todayLabel}</div>
        <div className="thisday-sub">Looking back across the years</div>
      </div>
      {byYear.map(([year, list]) => {
        const ago = new Date().getFullYear() - year;
        return (
          <section className="year-block" key={year}>
            <div className="year-head">
              <h2>{year}</h2>
              <span>{ago} {ago === 1 ? "year" : "years"} ago · {list.length} photos</span>
            </div>
            <div className="jrow wrap">
              {list.map((p) => (
                <PhotoTile key={p.id} photo={p} width={180 * (p.aspect || 1)} height={180} density="medium" />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
