import { useId, useState } from "react";
import { X } from "lucide-react";
import { useProjectLabels } from "@/hooks/useProjectLabels";
import { cn } from "@/lib/utils";

/** A–Z ignoring case (ASCII only, like the backend's sort, FB-213), ties broken by the exact text. */
function compareLabels(a: string, b: string): number {
  const lower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const la = lower(a);
  const lb = lower(b);
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

type LabelInputProps = {
  /** Suggestions come from this project's labels only. */
  projectId: number | null | undefined;
  value: string[];
  onChange: (labels: string[]) => void;
  id?: string;
  "aria-label"?: string;
  className?: string;
};

/**
 * Chip input for a task's labels (FB-99). Suggests the labels already used in
 * the same project and still accepts new ones. Chips are kept in the order the
 * backend stores them, so the joined string matches what comes back.
 */
export function LabelInput({ projectId, value, onChange, id, "aria-label": ariaLabel, className }: LabelInputProps) {
  const { data: projectLabels } = useProjectLabels(projectId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  const prefix = query.trim().toLowerCase();
  const suggestions = (projectLabels ?? []).filter(
    (l) => !value.includes(l) && l.toLowerCase().startsWith(prefix),
  );
  const showList = open && suggestions.length > 0;

  const add = (raw: string[]) => {
    const next = [...value];
    for (const r of raw) {
      const label = r.trim();
      if (label && !next.includes(label)) next.push(label);
    }
    setQuery("");
    setActive(-1);
    if (next.length !== value.length) onChange(next.sort(compareLabels));
  };

  const remove = (label: string) => onChange(value.filter((l) => l !== label));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      // Only swallow Enter when it adds something, so an empty field still submits a form.
      if (showList && active >= 0) {
        e.preventDefault();
        add([suggestions[active]]);
      } else if (query.trim()) {
        e.preventDefault();
        add([query]);
      }
    } else if (e.key === "Escape") {
      if (showList) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  const handleChange = (text: string) => {
    setOpen(true);
    setActive(-1);
    if (!text.includes(",")) {
      setQuery(text);
      return;
    }
    // A comma ends a label; whatever follows the last one keeps being typed.
    const parts = text.split(",");
    const rest = parts.pop() ?? "";
    add(parts);
    setQuery(rest);
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 rounded-md bg-gray-800 border border-gray-700 px-1.5 py-1 focus-within:ring-1 focus-within:ring-blue-500",
          className,
        )}
      >
        {value.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-0.5 bg-gray-700 text-gray-300 rounded px-1.5 py-0.5 text-xs"
          >
            {label}
            <button
              type="button"
              aria-label={`Remove label ${label}`}
              onClick={() => remove(label)}
              className="rounded text-gray-400 hover:text-gray-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (query.trim()) add([query]);
          }}
          placeholder={value.length === 0 ? "Add labels" : undefined}
          className="flex-1 min-w-[4rem] bg-transparent text-sm text-gray-100 placeholder:text-gray-500 outline-none py-0.5"
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Label suggestions"
          className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border border-gray-700 bg-gray-800 py-1 shadow-lg"
        >
          {suggestions.map((label, i) => (
            <li
              key={label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep focus in the input so its blur doesn't commit the typed prefix.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add([label])}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer px-2 py-1 text-sm text-gray-200",
                i === active && "bg-gray-700 text-white",
              )}
            >
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
