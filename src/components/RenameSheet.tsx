import { useMemo, useState } from "react";
import { useStore, selectVisible } from "../state/store";
import { Icon } from "./Icon";
import { PRESET_TEMPLATES, TOKENS, buildRenamePlan } from "../lib/rename/template";

interface Props {
  onClose: () => void;
}

/** Batch-rename preview over the currently visible photos. Non-destructive:
 *  Peruse shows the resolved names and can export the plan as a shell script;
 *  it never renames the originals from the browser sandbox on its own. */
export function RenameSheet({ onClose }: Props) {
  const visible = useStore(selectVisible);
  const toast = useStore((s) => s.toast);
  const [template, setTemplate] = useState(PRESET_TEMPLATES[0]);

  const plan = useMemo(
    () => buildRenamePlan(visible.slice(0, 500), template),
    [visible, template]
  );

  const exportPlan = () => {
    const lines = [
      "#!/bin/sh",
      "# Peruse rename plan — review before running. Non-destructive by default.",
      "set -e",
      "",
      ...plan.map((e) => `mv -n -- ${shq(e.from)} ${shq(withDir(e.from, e.to))}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "peruse-rename.sh";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Exported rename plan for ${plan.length} photos`);
  };

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Batch Rename</div>
            <div className="sheet-sub">{visible.length} photos in view</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="sheet-body">
          <input
            className="insp-input mono"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            spellCheck={false}
          />

          <div className="preset-row">
            {PRESET_TEMPLATES.map((t) => (
              <button
                key={t}
                className={`preset ${t === template ? "active" : ""}`}
                onClick={() => setTemplate(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="token-row">
            {TOKENS.map((t) => (
              <button
                key={t.token}
                className="token"
                title={`${t.label} → ${t.example}`}
                onClick={() => setTemplate((s) => s + `[${t.token}]`)}
              >
                [{t.token}]
              </button>
            ))}
          </div>

          <div className="rename-preview">
            {plan.slice(0, 40).map((e) => (
              <div className="rename-line" key={e.id}>
                <span className="from">{e.from.split("/").pop()}</span>
                <Icon name="chevronRight" size={12} />
                <span className="to">{e.to}</span>
              </div>
            ))}
            {plan.length > 40 && <div className="rename-more">+{plan.length - 40} more…</div>}
          </div>
        </div>

        <div className="sheet-foot">
          <span className="sheet-note">
            <Icon name="lock" size={12} /> Originals are untouched. Export a reviewed plan to apply.
          </span>
          <button className="btn-primary" onClick={exportPlan}>
            <Icon name="rename" size={14} /> Export rename plan
          </button>
        </div>
      </div>
    </div>
  );
}

function shq(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
function withDir(from: string, to: string): string {
  const slash = from.lastIndexOf("/");
  return slash === -1 ? to : `${from.slice(0, slash)}/${to}`;
}
