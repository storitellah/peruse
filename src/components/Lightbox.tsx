import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore, selectVisible, deviceLabel } from "../state/store";
import { Icon } from "./Icon";
import { readBlob } from "../lib/fs/scanner";
import { formatDateTime } from "../lib/util/misc";

/** Floating full-resolution viewer. Decodes the original bytes on demand and
 *  supports zoom, keyboard navigation, and an info overlay. */
export function Lightbox() {
  const lightboxId = useStore((s) => s.lightboxId);
  const openLightbox = useStore((s) => s.openLightbox);
  const select = useStore((s) => s.select);
  const visible = useStore(selectVisible);

  const index = useMemo(
    () => visible.findIndex((p) => p.id === lightboxId),
    [visible, lightboxId]
  );
  const photo = index >= 0 ? visible[index] : undefined;

  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const go = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = visible[(index + delta + visible.length) % visible.length];
      if (next) {
        openLightbox(next.id);
        select(next.id);
        setZoom(false);
      }
    },
    [index, visible, openLightbox, select]
  );

  // Load full-resolution bytes for the current photo.
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setZoom(false);
    if (!photo) {
      setFullUrl(null);
      return;
    }
    setLoading(true);
    setFullUrl(photo.thumbUrl ?? null); // show thumb immediately, upgrade below
    readBlob(photo)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setFullUrl(url);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [photo]);

  // Keyboard controls.
  useEffect(() => {
    if (!photo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") openLightbox(null);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "i") setShowInfo((v) => !v);
      else if (e.key === " ") {
        e.preventDefault();
        setZoom((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photo, go, openLightbox]);

  if (!photo) return null;

  return (
    <div className="lightbox" onClick={() => openLightbox(null)}>
      <div className="lb-toolbar" onClick={(e) => e.stopPropagation()}>
        <span className="lb-index">
          {index + 1} / {visible.length}
        </span>
        <div className="lb-tools">
          <button className="icon-btn light" onClick={() => openLightbox(null)} title="Close (Esc)">
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      {/* Side Details button — appears during full preview, opens the panel. */}
      {!showInfo && (
        <button
          className="lb-details-btn"
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo(true);
          }}
          title="View details (i)"
        >
          <Icon name="info" size={16} />
          <span>Details</span>
        </button>
      )}

      <button
        className={`lb-nav left`}
        onClick={(e) => { e.stopPropagation(); go(-1); }}
        aria-label="Previous"
      >
        <Icon name="chevronLeft" size={26} />
      </button>
      <button
        className={`lb-nav right ${showInfo ? "shifted" : ""}`}
        onClick={(e) => { e.stopPropagation(); go(1); }}
        aria-label="Next"
      >
        <Icon name="chevronRight" size={26} />
      </button>

      <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
        {fullUrl && (
          <img
            className={`lb-img ${zoom ? "zoom" : ""}`}
            src={fullUrl}
            alt={photo.iptc.caption || photo.name}
            onClick={() => setZoom((v) => !v)}
            draggable={false}
          />
        )}
        {loading && <span className="lb-spinner spinner" />}
      </div>

      {showInfo && (
        <aside className="lb-details" onClick={(e) => e.stopPropagation()}>
          <div className="lb-details-head">
            <span>Details</span>
            <button className="icon-btn light" onClick={() => setShowInfo(false)} aria-label="Hide details">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="lb-details-body">
            <div className="lb-info-name">{photo.name}</div>
            <div className="lb-info-sub">{formatDateTime(photo.exif.takenAt)}</div>

            <div className="lb-detail-row">
              <Icon name="device" size={14} />
              <span>{deviceLabel(photo)}</span>
            </div>
            {photo.exif.place && (
              <div className="lb-detail-row">
                <Icon name="location" size={14} />
                <span>{[photo.exif.place.city, photo.exif.place.region, photo.exif.place.country].filter(Boolean).join(", ")}</span>
              </div>
            )}

            <div className="lb-info-grid">
              {photo.exif.width && <span>{photo.exif.width} × {photo.exif.height}</span>}
              {photo.exif.fNumber && <span>ƒ/{photo.exif.fNumber}</span>}
              {photo.exif.exposureTime && <span>{photo.exif.exposureTime}</span>}
              {photo.exif.iso && <span>ISO {photo.exif.iso}</span>}
              {photo.exif.focalLength && <span>{photo.exif.focalLength} mm</span>}
              {photo.exif.lensModel && <span>{photo.exif.lensModel}</span>}
            </div>

            {photo.iptc.caption && <p className="lb-detail-caption">{photo.iptc.caption}</p>}

            {(photo.aiTags.length > 0 || photo.iptc.tags.length > 0 || photo.iptc.people.length > 0) && (
              <div className="chips">
                {photo.iptc.people.map((p) => (
                  <span className="chip" key={"p" + p}>{p}</span>
                ))}
                {photo.iptc.tags.map((t) => (
                  <span className="chip" key={"t" + t}>{t}</span>
                ))}
                {photo.aiTags.map((t) => (
                  <span className="chip ai" key={t.label}>{t.label}</span>
                ))}
              </div>
            )}

            <div className="lb-detail-flags">
              {photo.isLivePhoto && <span className="insp-live"><span className="live-dot" /> LIVE</span>}
              {photo.isRaw && <span className="lb-flag">{photo.ext.toUpperCase()}</span>}
              {photo.isScreenshot && <span className="lb-flag">SCREENSHOT</span>}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
