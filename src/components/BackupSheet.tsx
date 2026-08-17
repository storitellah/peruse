import { useRef, useState } from "react";
import { useStore } from "../state/store";
import type { BackupFrequency } from "../state/store";
import { Icon } from "./Icon";
import { formatDateTime } from "../lib/util/misc";

interface Props {
  onClose: () => void;
}

const FREQS: { id: BackupFrequency; label: string; note: string }[] = [
  { id: "off", label: "Manual", note: "Only when you click Back up" },
  { id: "daily", label: "Daily", note: "Once every 24 hours" },
  { id: "weekly", label: "Weekly", note: "Once every 7 days" },
];

/** Catalog backup controls. Backups are metadata-only, compressed, optionally
 *  encrypted, and written entirely on-device — never uploaded. */
export function BackupSheet({ onClose }: Props) {
  const backupFrequency = useStore((s) => s.backupFrequency);
  const backupEncrypt = useStore((s) => s.backupEncrypt);
  const lastBackupAt = useStore((s) => s.lastBackupAt);
  const backupDirName = useStore((s) => s.backupDirName);
  const backupBusy = useStore((s) => s.backupBusy);
  const photoCount = useStore((s) => s.photos.length);

  const setBackupFrequency = useStore((s) => s.setBackupFrequency);
  const setBackupEncrypt = useStore((s) => s.setBackupEncrypt);
  const setSessionPassphrase = useStore((s) => s.setSessionPassphrase);
  const chooseBackupFolder = useStore((s) => s.chooseBackupFolder);
  const backupNow = useStore((s) => s.backupNow);
  const restoreBackup = useStore((s) => s.restoreBackup);

  const [pass, setPass] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const restoreRef = useRef<HTMLInputElement>(null);

  const applyPass = (v: string) => {
    setPass(v);
    setSessionPassphrase(v);
  };

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Catalog Backup</div>
            <div className="sheet-sub">{photoCount.toLocaleString()} photos cataloged</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="backup-note">
            <Icon name="lock" size={14} />
            <span>
              Backs up your catalog’s <strong>metadata only</strong> — captions, tags, people,
              ratings, locations, and AI labels — as a compressed <code>.peruse</code> file. Your
              photos are never copied or uploaded. A library of thousands of photos backs up in a
              handful of kilobytes.
            </span>
          </div>

          {/* Schedule */}
          <div className="backup-field">
            <div className="backup-label">Schedule</div>
            <div className="seg-row">
              {FREQS.map((f) => (
                <button
                  key={f.id}
                  className={`seg ${backupFrequency === f.id ? "active" : ""}`}
                  onClick={() => setBackupFrequency(f.id)}
                >
                  <span>{f.label}</span>
                  <em>{f.note}</em>
                </button>
              ))}
            </div>
          </div>

          {/* Destination */}
          <div className="backup-field">
            <div className="backup-label">Destination folder</div>
            <div className="backup-dest">
              <button className="btn-ghost" onClick={() => void chooseBackupFolder()}>
                <Icon name="folder" size={14} />
                {backupDirName ? `“${backupDirName}”` : "Choose folder…"}
              </button>
              <span className="backup-hint">
                {backupDirName
                  ? "Scheduled backups write here automatically."
                  : "Without a folder, backups download to your Downloads."}
              </span>
            </div>
          </div>

          {/* Encryption */}
          <div className="backup-field">
            <label className="backup-toggle">
              <input
                type="checkbox"
                checked={backupEncrypt}
                onChange={(e) => setBackupEncrypt(e.target.checked)}
              />
              <span>
                <strong>Encrypt backups</strong> — AES-256, passphrase-derived key
              </span>
            </label>
            {backupEncrypt && (
              <input
                className="insp-input"
                type="password"
                value={pass}
                placeholder="Passphrase (kept in memory only, never stored)"
                onChange={(e) => applyPass(e.target.value)}
              />
            )}
          </div>

          <div className="backup-status">
            {lastBackupAt ? `Last backup: ${formatDateTime(lastBackupAt)}` : "No backups yet"}
          </div>

          {/* Restore */}
          <div className="backup-field">
            <div className="backup-label">Restore</div>
            <div className="backup-dest">
              <button className="btn-ghost" onClick={() => restoreRef.current?.click()}>
                <Icon name="layers" size={14} /> Choose .peruse file…
              </button>
              <input
                className="insp-input"
                type="password"
                value={restorePass}
                placeholder="Passphrase (if encrypted)"
                onChange={(e) => setRestorePass(e.target.value)}
                style={{ maxWidth: 220 }}
              />
            </div>
            <span className="backup-hint">
              Re-applies your saved captions, tags, and ratings to matching photos in the
              current library.
            </span>
            <input
              ref={restoreRef}
              type="file"
              accept=".peruse,application/octet-stream"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restoreBackup(f, restorePass || undefined);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="sheet-foot">
          <span className="sheet-note">
            <Icon name="lock" size={12} /> 100% on-device · nothing leaves your machine
          </span>
          <button className="btn-primary" disabled={backupBusy} onClick={() => void backupNow(pass || undefined)}>
            <Icon name="check" size={14} /> {backupBusy ? "Working…" : "Back up now"}
          </button>
        </div>
      </div>
    </div>
  );
}
