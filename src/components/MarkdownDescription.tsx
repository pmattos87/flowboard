import { useState } from "react";
import { MarkdownView } from "@/components/MarkdownView";
import { Textarea } from "@/components/ui/textarea";

/**
 * Task description (FB-100). Read mode renders the raw text as Markdown;
 * clicking it (or Enter) swaps in the textarea, and blur commits and returns
 * to read mode. The stored text is never transformed — only displayed.
 *
 * Links render as plain text and images are dropped: the app makes no
 * external requests and opens nothing outside the window (D-012).
 */
export function MarkdownDescription({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onCommit();
        }}
        placeholder="Add a description…"
        rows={8}
        className="bg-gray-800 border-gray-700 text-gray-100 text-sm"
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Edit description"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className="min-h-[2.5rem] rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 cursor-text hover:border-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-500"
    >
      {value.trim() ? (
        <MarkdownView value={value} />
      ) : (
        <span className="text-gray-500">Add a description…</span>
      )}
    </div>
  );
}
