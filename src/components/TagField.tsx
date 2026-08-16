import { useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

interface Props {
  values: string[];
  placeholder?: string;
  onChange: (values: string[]) => void;
}

/** A token / pill input for people and tag lists. */
export function TagField({ values, placeholder, onChange }: Props) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="tagfield">
      {values.map((v) => (
        <span className="chip removable" key={v}>
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
      />
    </div>
  );
}
