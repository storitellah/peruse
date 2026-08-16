import { useMemo } from "react";
import { useStore, deviceLabel } from "../../state/store";
import { Icon } from "../Icon";

interface DeviceStat {
  device: string;
  make: string;
  count: number;
  first?: number;
  last?: number;
  sampleThumb?: string;
}

/** Device breakdown matrix: every smartphone/camera model in the library. */
export function Attributes() {
  const photos = useStore((s) => s.photos);
  const setTab = useStore((s) => s.setTab);
  const setFilter = useStore((s) => s.setFilter);

  const stats = useMemo(() => {
    const map = new Map<string, DeviceStat>();
    for (const p of photos) {
      if (p.softDeleted) continue;
      const device = deviceLabel(p);
      const s = map.get(device) ?? {
        device,
        make: p.exif.make ?? "",
        count: 0,
      };
      s.count += 1;
      const t = p.exif.takenAt;
      if (t) {
        s.first = s.first ? Math.min(s.first, t) : t;
        s.last = s.last ? Math.max(s.last, t) : t;
      }
      if (!s.sampleThumb && p.thumbUrl) s.sampleThumb = p.thumbUrl;
      map.set(device, s);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [photos]);

  const total = stats.reduce((n, s) => n + s.count, 0);
  const max = stats[0]?.count ?? 1;

  if (stats.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="device" size={38} strokeWidth={1.3} />
        <p>No device metadata found yet.</p>
      </div>
    );
  }

  return (
    <div className="gallery-scroll">
      <div className="attr-head">
        <div className="attr-total">{stats.length}</div>
        <div className="attr-total-label">
          {stats.length === 1 ? "device" : "devices"} · {total.toLocaleString()} photos
        </div>
      </div>

      <div className="attr-list">
        {stats.map((s) => {
          const years =
            s.first && s.last
              ? new Date(s.first).getFullYear() === new Date(s.last).getFullYear()
                ? `${new Date(s.first).getFullYear()}`
                : `${new Date(s.first).getFullYear()}–${new Date(s.last).getFullYear()}`
              : "—";
          return (
            <button
              key={s.device}
              className="attr-row"
              onClick={() => {
                setTab("library");
                setFilter({ kind: "device", value: s.device });
              }}
            >
              <div className="attr-thumb">
                {s.sampleThumb ? <img src={s.sampleThumb} alt="" /> : <Icon name="device" size={20} />}
              </div>
              <div className="attr-info">
                <div className="attr-name">{s.device}</div>
                <div className="attr-meta">{years}</div>
                <div className="attr-bar">
                  <div className="attr-bar-fill" style={{ width: `${(s.count / max) * 100}%` }} />
                </div>
              </div>
              <div className="attr-count">
                {s.count.toLocaleString()}
                <Icon name="chevronRight" size={15} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
