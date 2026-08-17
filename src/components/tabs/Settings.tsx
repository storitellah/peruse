import { useEffect, useState } from "react";
import { useStore } from "../../state/store";
import type { GridDensity, Theme } from "../../types";
import { Icon } from "../Icon";
import { APP_VERSION, REPO_URL, SUPPORT_EMAIL } from "../../lib/version";
import { canInstall, isStandalone, onInstallAvailable, promptInstall } from "../../lib/pwa";
import { clearThumbCache } from "../../lib/thumbs/cache";

const STORITELLAH_URL = "https://storitellah.com";

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];
const DENSITIES: GridDensity[] = ["compact", "medium", "detailed"];

export function Settings() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const hideScreenshots = useStore((s) => s.hideScreenshots);
  const setHideScreenshots = useStore((s) => s.setHideScreenshots);
  const hideNonCamera = useStore((s) => s.hideNonCamera);
  const setHideNonCamera = useStore((s) => s.setHideNonCamera);
  const toast = useStore((s) => s.toast);

  const [installable, setInstallable] = useState(canInstall());
  const [standalone] = useState(isStandalone());
  useEffect(() => onInstallAvailable(setInstallable), []);

  const install = async () => {
    const r = await promptInstall();
    if (r === "unavailable") {
      toast("Use your browser’s “Install app” option in the address bar or menu");
    }
  };

  return (
    <div className="gallery-scroll settings-scroll">
      <div className="settings-page">
        <h1 className="settings-title">Settings</h1>

        {/* Appearance */}
        <section className="settings-card">
          <div className="settings-card-title">
            <Icon name="grid" size={16} /> Appearance
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Theme</div>
              <div className="settings-row-desc">Match the system or lock light/dark.</div>
            </div>
            <div className="seg-row compact">
              {THEMES.map((t) => (
                <button key={t.id} className={`seg ${theme === t.id ? "active" : ""}`} onClick={() => setTheme(t.id)}>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Default grid size</div>
              <div className="settings-row-desc">How large photos appear in the library.</div>
            </div>
            <div className="seg-row compact">
              {DENSITIES.map((d) => (
                <button key={d} className={`seg ${density === d ? "active" : ""}`} onClick={() => setDensity(d)}>
                  <span style={{ textTransform: "capitalize" }}>{d}</span>
                </button>
              ))}
            </div>
          </div>

          <ToggleRow name="Hide screenshots" desc="Screenshots are always flagged; hide them from the library." checked={hideScreenshots} onChange={setHideScreenshots} />
          <ToggleRow name="Only camera photos" desc="Hide images with no camera metadata (screenshots, saved graphics)." checked={hideNonCamera} onChange={setHideNonCamera} />
        </section>

        {/* Install */}
        <section className="settings-card">
          <div className="settings-card-title">
            <Icon name="device" size={16} /> Install
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Install Peruse on this device</div>
              <div className="settings-row-desc">
                Runs in its own window, works offline, and launches like a native app — still 100% local.
              </div>
            </div>
            {standalone ? (
              <span className="settings-pill ok">
                <Icon name="check" size={14} /> Installed
              </span>
            ) : installable ? (
              <button className="btn-primary" onClick={() => void install()}>
                <Icon name="check" size={15} /> Install app
              </button>
            ) : (
              <span className="settings-hint">Use your browser’s “Install app” option</span>
            )}
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Version</div>
              <div className="settings-row-desc">Peruse {APP_VERSION} · updates install automatically.</div>
            </div>
          </div>
        </section>

        {/* Storage */}
        <section className="settings-card">
          <div className="settings-card-title">
            <Icon name="layers" size={16} /> Storage
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Thumbnail cache</div>
              <div className="settings-row-desc">Decoded thumbnails are cached on-device for instant reloads.</div>
            </div>
            <button
              className="btn-ghost"
              onClick={async () => {
                await clearThumbCache();
                toast("Thumbnail cache cleared");
              }}
            >
              <Icon name="trash" size={14} /> Clear cache
            </button>
          </div>
        </section>

        {/* About */}
        <section className="settings-card">
          <div className="settings-card-title">
            <Icon name="info" size={16} /> About &amp; Support
          </div>

          <div className="about-hero">
            <div className="about-glyph">
              <img src="/favicon.svg" alt="Peruse" width={40} height={40} />
            </div>
            <div>
              <div className="about-name">Peruse</div>
              <div className="about-tag">Local-first photo cataloging · {APP_VERSION}</div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Built by</div>
              <div className="settings-row-desc">
                <a className="link" href={STORITELLAH_URL} target="_blank" rel="noreferrer">
                  Storitellah
                </a>
              </div>
            </div>
            <a className="btn-ghost" href={STORITELLAH_URL} target="_blank" rel="noreferrer">
              storitellah.com
            </a>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Support</div>
              <div className="settings-row-desc">Questions, bugs, or feedback.</div>
            </div>
            <div className="install-btns">
              <a className="btn-ghost" href={`mailto:${SUPPORT_EMAIL}?subject=Peruse%20support`}>
                <Icon name="info" size={14} /> {SUPPORT_EMAIL}
              </a>
              <a className="btn-ghost" href={REPO_URL} target="_blank" rel="noreferrer">
                Source
              </a>
            </div>
          </div>

          <div className="about-privacy">
            <Icon name="lock" size={13} /> Peruse runs entirely on your device. Your photos are never uploaded.
          </div>
        </section>
      </div>
    </div>
  );
}

function ToggleRow({
  name,
  desc,
  checked,
  onChange,
}: {
  name: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <div className="settings-row-name">{name}</div>
        <div className="settings-row-desc">{desc}</div>
      </div>
      <button className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
        <span className="switch-knob" />
      </button>
    </div>
  );
}
