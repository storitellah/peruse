import { useMemo, useState } from "react";
import { useStore, deviceLabel } from "../state/store";
import { Icon } from "./Icon";
import { formatBytes, formatDateTime } from "../lib/util/misc";
import { TagField } from "./TagField";
import { RenameSheet } from "./RenameSheet";

export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const photo = useStore((s) => s.photos.find((p) => p.id === selectedId));
  const updateIptc = useStore((s) => s.updateIptc);
  const setRating = useStore((s) => s.setRating);
  const saveSidecar = useStore((s) => s.saveSidecar);
  const softDelete = useStore((s) => s.softDelete);
  const setInspectorOpen = useStore((s) => s.setInspectorOpen);
  const openLightbox = useStore((s) => s.openLightbox);

  const [renameOpen, setRenameOpen] = useState(false);

  const exifRows = useMemo(() => {
    if (!photo) return [];
    const e = photo.exif;
    const rows: [string, string][] = [];
    if (e.width && e.height) rows.push(["Dimensions", `${e.width} × ${e.height}`]);
    if (e.focalLength) rows.push(["Focal length", `${e.focalLength} mm${e.focalLength35 ? ` (${e.focalLength35} mm eq.)` : ""}`]);
    if (e.fNumber) rows.push(["Aperture", `ƒ/${e.fNumber}`]);
    if (e.exposureTime) rows.push(["Shutter", e.exposureTime]);
    if (e.iso) rows.push(["ISO", String(e.iso)]);
    if (e.lensModel) rows.push(["Lens", e.lensModel]);
    if (e.gps) rows.push(["Coordinates", `${e.gps.lat.toFixed(4)}, ${e.gps.lon.toFixed(4)}`]);
    rows.push(["File size", formatBytes(photo.sizeBytes)]);
    rows.push(["Path", photo.relPath]);
    return rows;
  }, [photo]);

  if (!photo) return null;

  const place = photo.exif.place;
  const rating = photo.iptc.rating ?? 0;

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <span className="inspector-title">Info</span>
        <button className="icon-btn" onClick={() => setInspectorOpen(false)} aria-label="Close inspector">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="inspector-scroll">
        <button className="inspector-hero" onClick={() => openLightbox(photo.id)}>
          {photo.thumbUrl && <img src={photo.thumbUrl} alt={photo.name} />}
          <span className="hero-expand">
            <Icon name="search" size={14} /> Open
          </span>
        </button>

        <div className="insp-name">{photo.name}</div>
        <div className="insp-sub">
          {formatDateTime(photo.exif.takenAt)}
          {photo.exif.timezone ? ` (UTC${photo.exif.timezone})` : ""}
        </div>

        {/* Rating */}
        <div className="rating-row">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className="star-btn"
              onClick={() => setRating(photo.id, rating === n ? 0 : n)}
              aria-label={`Rate ${n}`}
            >
              <Icon name={n <= rating ? "starFill" : "star"} size={18} />
            </button>
          ))}
        </div>

        {/* Device */}
        <div className="insp-device">
          <Icon name="device" size={15} />
          <span>{deviceLabel(photo)}</span>
        </div>

        {place && (
          <div className="insp-device">
            <Icon name="location" size={15} />
            <span>
              {[place.city, place.region, place.country].filter(Boolean).join(", ")}
              {typeof place.approxKm === "number" && place.approxKm > 3 && (
                <em className="approx"> · ~{place.approxKm} km</em>
              )}
            </span>
          </div>
        )}

        {/* AI tags */}
        {photo.aiTags.length > 0 && (
          <div className="insp-section">
            <div className="insp-label">
              <Icon name="sparkles" size={13} /> Detected
            </div>
            <div className="chips">
              {photo.aiTags.map((t) => (
                <span className="chip ai" key={t.label}>
                  {t.label}
                  <em>{Math.round(t.score * 100)}%</em>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Editable IPTC */}
        <div className="insp-section">
          <div className="insp-label">Caption</div>
          <textarea
            className="insp-textarea"
            value={photo.iptc.caption ?? ""}
            placeholder="Add a caption…"
            rows={2}
            onChange={(e) => updateIptc(photo.id, { caption: e.target.value })}
          />
        </div>

        <div className="insp-section">
          <div className="insp-label">
            <Icon name="person" size={13} /> People
          </div>
          <TagField
            values={photo.iptc.people}
            placeholder="Add a name…"
            onChange={(people) => updateIptc(photo.id, { people })}
          />
        </div>

        <div className="insp-section">
          <div className="insp-label">
            <Icon name="tag" size={13} /> Tags
          </div>
          <TagField
            values={photo.iptc.tags}
            placeholder="Add a tag…"
            onChange={(tags) => updateIptc(photo.id, { tags })}
          />
        </div>

        <div className="insp-section">
          <div className="insp-label">Verified location</div>
          <input
            className="insp-input"
            value={photo.iptc.location ?? ""}
            placeholder={place?.city ?? "e.g. Kyoto, Japan"}
            onChange={(e) => updateIptc(photo.id, { location: e.target.value })}
          />
        </div>

        {/* EXIF read-only */}
        <div className="insp-section">
          <div className="insp-label">
            <Icon name="info" size={13} /> EXIF
          </div>
          <dl className="exif-list">
            {exifRows.map(([k, v]) => (
              <div className="exif-row" key={k}>
                <dt>{k}</dt>
                <dd title={v}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="insp-actions">
          <button className="btn-primary full" onClick={() => void saveSidecar(photo.id)}>
            <Icon name="check" size={15} /> Write metadata (XMP)
          </button>
          <div className="insp-action-row">
            <button className="btn-ghost" onClick={() => setRenameOpen(true)}>
              <Icon name="rename" size={14} /> Rename…
            </button>
            <button className="btn-ghost danger" onClick={() => softDelete(photo.id)}>
              <Icon name="trash" size={14} /> Trash
            </button>
          </div>
        </div>
      </div>

      {renameOpen && <RenameSheet onClose={() => setRenameOpen(false)} />}
    </aside>
  );
}
