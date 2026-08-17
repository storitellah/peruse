import { useEffect, useState } from "react";
import { useStore } from "../../state/store";
import type { GridDensity, Theme } from "../../types";
import { Icon } from "../Icon";
import { APP_VERSION, RELEASES_URL, REPO_URL, SUPPORT_EMAIL } from "../../lib/version";

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "system", label: "System", icon: "☾/☀" },
  { id: "light", label: "Light", icon: "☀" },
  { id: "dark", label: "Dark", icon: "☾" },
];

const DENSITIES: GridDensity[] = ["compact", "medium", "detailed"];

const BUILDER_KEY = "peruse.builderName";

export function Settings() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const hideScreenshots = useStore((s) => s.hideScreenshots);
  const setHideScreenshots = useStore((s) => s.setHideScreenshots);
  const hideNonCamera = useStore((s) => s.hideNonCamera);
  const setHideNonCamera = useStore((s) => s.setHideNonCamera);

  const [builder, setBuilder] = useState("Storitellah");
  useEffect(() => {
    try {
      setBuilder(localStorage.getItem(BUILDER_KEY) || "Storitellah");
    } catch {
      /* ignore */
    }
  }, []);
  const saveBuilder = (v: string) => {
    setBuilder(v);
    try {
      localStorage.setItem(BUILDER_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const platform = detectPlatform();

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

          <ToggleRow
            name="Hide screenshots"
            desc="Screenshots are always flagged; hide them from the library."
            checked={hideScreenshots}
            onChange={setHideScreenshots}
          />
          <ToggleRow
            name="Only camera photos"
            desc="Hide images with no camera metadata (screenshots, saved graphics)."
            checked={hideNonCamera}
            onChange={setHideNonCamera}
          />
        </section>

        {/* Install & Updates */}
        <section className="settings-card">
          <div className="settings-card-title">
            <Icon name="device" size={16} /> Install &amp; Updates
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Version</div>
              <div className="settings-row-desc">Peruse {APP_VERSION}</div>
            </div>
            <a className="btn-ghost" href={RELEASES_URL} target="_blank" rel="noreferrer">
              <Icon name="check" size={14} /> Check for updates
            </a>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-name">Install on this device</div>
              <div className="settings-row-desc">
                Get the native desktop app — a local, offline install for {platform.label}.
              </div>
            </div>
            <div className="install-btns">
              <a className={`btn-primary ${platform.mac ? "" : "dim"}`} href={RELEASES_URL} target="_blank" rel="noreferrer">
                <AppleMark /> macOS .dmg
              </a>
              <a className={`btn-ghost ${platform.win ? "" : "dim"}`} href={RELEASES_URL} target="_blank" rel="noreferrer">
                <WindowsMark /> Windows .exe
              </a>
            </div>
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
              <div className="settings-row-desc">Shown in exports and this About panel.</div>
            </div>
            <input className="insp-input" style={{ maxWidth: 200 }} value={builder} onChange={(e) => saveBuilder(e.target.value)} />
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

function detectPlatform() {
  const p = typeof navigator !== "undefined" ? navigator.platform + " " + navigator.userAgent : "";
  const mac = /Mac/i.test(p);
  const win = /Win/i.test(p);
  return { mac, win, label: mac ? "macOS" : win ? "Windows" : "your platform" };
}

function AppleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.8 2.3 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 2-1.1 2.7-2.2.9-1.3 1.2-2.5 1.2-2.6-.0-.0-2.3-.9-2.3-3.5zM14.2 6.3c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.8 1 .0 2-.5 2.6-1.3z" />
    </svg>
  );
}

function WindowsMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5.5l7.5-1v7.2H3V5.5zm0 13l7.5 1v-7.1H3v6.1zM11.3 4.3L21 3v8.7h-9.7V4.3zm0 8.4H21V21l-9.7-1.3v-7z" />
    </svg>
  );
}
