import { useEffect, useMemo } from "react";
import { useStore } from "../../state/store";
import { Icon } from "../Icon";
import { formatBytes } from "../../lib/util/misc";
import type { Photo } from "../../types";

/** Duplicate / burst review: each group offers a 1-click "keep best" workflow. */
export function Duplicates() {
  const groups = useStore((s) => s.duplicateGroups);
  const photos = useStore((s) => s.photos);
  const softDelete = useStore((s) => s.softDelete);
  const select = useStore((s) => s.select);
  const openLightbox = useStore((s) => s.openLightbox);
  const toast = useStore((s) => s.toast);
  const requestThumb = useStore((s) => s.requestThumb);
  const scanDuplicates = useStore((s) => s.scanDuplicates);
  const dupScanning = useStore((s) => s.dupScanning);
  const dupScanProgress = useStore((s) => s.dupScanProgress);
  const hashedCount = useStore((s) => s.photos.filter((p) => p.phash && !p.softDeleted).length);
  const totalCount = useStore((s) => s.photos.filter((p) => !p.softDeleted).length);

  const byId = useMemo(() => {
    const m = new Map<string, Photo>();
    for (const p of photos) m.set(p.id, p);
    return m;
  }, [photos]);

  const liveGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, live: g.photoIds.map((id) => byId.get(id)).filter((p): p is Photo => !!p && !p.softDeleted) }))
        .filter((g) => g.live.length >= 2),
    [groups, byId]
  );

  const reclaimable = useMemo(
    () => liveGroups.reduce((sum, g) => sum + g.live.slice(1).reduce((n, p) => n + p.sizeBytes, 0), 0),
    [liveGroups]
  );

  // Thumbnails decode lazily, so make sure the ones shown in dup groups load.
  useEffect(() => {
    for (const g of liveGroups) for (const p of g.live) if (!p.thumbUrl) requestThumb(p.id);
  }, [liveGroups, requestThumb]);

  const keepBest = (photoIds: Photo[]) => {
    photoIds.slice(1).forEach((p) => softDelete(p.id));
  };

  const unhashed = totalCount - hashedCount;

  const keepAll = () => {
    let removed = 0;
    for (const g of liveGroups) {
      g.live.slice(1).forEach((p) => {
        softDelete(p.id);
        removed += 1;
      });
    }
    toast(`Trashed ${removed} duplicate${removed === 1 ? "" : "s"}`);
  };

  if (liveGroups.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="layers" size={38} strokeWidth={1.3} />
        {unhashed > 0 ? (
          <>
            <p>
              Scan your library to find duplicates and burst shots.
              {hashedCount > 0 ? ` ${hashedCount.toLocaleString()} of ${totalCount.toLocaleString()} checked so far.` : ""}
            </p>
            <button className="btn-primary" disabled={dupScanning} onClick={() => void scanDuplicates()}>
              <Icon name="layers" size={15} />
              {dupScanning ? `Scanning… ${dupScanProgress}%` : `Scan ${unhashed.toLocaleString()} photos`}
            </button>
          </>
        ) : (
          <p>No duplicates or burst shots detected. Your library is tidy.</p>
        )}
      </div>
    );
  }

  return (
    <div className="gallery-scroll">
      <div className="dup-head">
        <div>
          <div className="dup-count">{liveGroups.length} groups</div>
          <div className="dup-sub">~{formatBytes(reclaimable)} reclaimable by keeping the best of each</div>
        </div>
        <div className="dup-head-actions">
          {unhashed > 0 && (
            <button className="btn-ghost" disabled={dupScanning} onClick={() => void scanDuplicates()}>
              <Icon name="layers" size={14} />
              {dupScanning ? `Scanning ${dupScanProgress}%` : `Scan ${unhashed.toLocaleString()} more`}
            </button>
          )}
          <button className="btn-primary" onClick={keepAll}>
            <Icon name="sparkles" size={14} /> Keep best of all
          </button>
        </div>
      </div>

      {liveGroups.map((g) => (
        <section className="dup-group" key={g.id}>
          <div className="dup-group-head">
            <span>
              {g.live.length} similar · <em>spread {g.spread}/64</em>
            </span>
            <button className="btn-mini" onClick={() => keepBest(g.live)}>
              <Icon name="check" size={13} /> Keep best, trash {g.live.length - 1}
            </button>
          </div>
          <div className="dup-strip">
            {g.live.map((p, i) => (
              <figure
                key={p.id}
                className={`dup-item ${i === 0 ? "best" : ""}`}
                onClick={() => {
                  select(p.id);
                  openLightbox(p.id);
                }}
              >
                {p.thumbUrl && <img src={p.thumbUrl} alt={p.name} />}
                {i === 0 && <span className="dup-badge best-badge">Best</span>}
                <figcaption>
                  {p.exif.width ? `${p.exif.width}×${p.exif.height}` : "—"} · {formatBytes(p.sizeBytes)}
                </figcaption>
                {i !== 0 && (
                  <button
                    className="dup-trash"
                    onClick={(e) => {
                      e.stopPropagation();
                      softDelete(p.id);
                    }}
                    aria-label="Trash"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
