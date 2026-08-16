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
          <button className={`icon-btn light ${showInfo ? "on" : ""}`} onClick={() => setShowInfo((v) => !v)} title="Info (i)">
            <Icon name="info" size={18} />
          </button>
          <button className="icon-btn light" onClick={() => openLightbox(null)} title="Close (Esc)">
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      <button className="lb-nav left" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous">
        <Icon name="chevronLeft" size={26} />
      </button>
      <button className="lb-nav right" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next">
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
        <div className="lb-info" onClick={(e) => e.stopPropagation()}>
          <div className="lb-info-name">{photo.name}</div>
          <div className="lb-info-sub">{formatDateTime(photo.exif.takenAt)}</div>
          <div className="lb-info-grid">
            <span>{deviceLabel(photo)}</span>
            {photo.exif.width && <span>{photo.exif.width} × {photo.exif.height}</span>}
            {photo.exif.fNumber && <span>ƒ/{photo.exif.fNumber}</span>}
            {photo.exif.exposureTime && <span>{photo.exif.exposureTime}</span>}
            {photo.exif.iso && <span>ISO {photo.exif.iso}</span>}
            {photo.exif.focalLength && <span>{photo.exif.focalLength} mm</span>}
          </div>
          {photo.exif.place && (
            <div className="lb-info-loc">
              <Icon name="location" size={13} />
              {[photo.exif.place.city, photo.exif.place.country].filter(Boolean).join(", ")}
            </div>
          )}
          {photo.aiTags.length > 0 && (
            <div className="chips">
              {photo.aiTags.map((t) => (
                <span className="chip ai" key={t.label}>{t.label}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
