import { memo } from "react";
import { useStore } from "../state/store";
import type { GridDensity, Photo } from "../types";
import { Icon } from "./Icon";

interface Props {
  photo: Photo;
  width: number;
  height: number;
  density: GridDensity;
}

function TileImpl({ photo, width, height, density }: Props) {
  const select = useStore((s) => s.select);
  const openLightbox = useStore((s) => s.openLightbox);
  // Subscribe to just this tile's selection so only the two affected tiles
  // re-render when the selection moves, not the whole grid.
  const selected = useStore((s) => s.selectedId === photo.id);

  const rating = photo.iptc.rating ?? 0;
  const topTag = photo.aiTags[0]?.label;

  return (
    <figure
      className={`tile ${selected ? "sel" : ""}`}
      style={{ width, height }}
      onClick={() => select(photo.id)}
      onDoubleClick={() => openLightbox(photo.id)}
      title={photo.name}
    >
      {photo.thumbUrl ? (
        <img src={photo.thumbUrl} alt={photo.iptc.caption || photo.name} loading="lazy" draggable={false} />
      ) : (
        <div className="tile-skeleton">
          <span className="spinner sm" />
        </div>
      )}

      {rating >= 4 && (
        <span className="tile-fav">
          <Icon name="starFill" size={12} />
        </span>
      )}

      {photo.isLivePhoto && (
        <span className="tile-live" title="Live Photo">
          <span className="live-dot" />
          LIVE
        </span>
      )}

      {density !== "compact" && (topTag || photo.exif.place?.city) && (
        <figcaption className="tile-cap">
          {topTag && <span className="tile-tag">{topTag}</span>}
          {photo.exif.place?.city && <span className="tile-loc">{photo.exif.place.city}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export const PhotoTile = memo(
  TileImpl,
  (a, b) =>
    a.photo === b.photo &&
    a.width === b.width &&
    a.height === b.height &&
    a.density === b.density
);
