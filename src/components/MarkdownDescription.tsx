import { useState } from "react";
import ReactMarkdown from "react-markdown";
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
      className="min-h-[2.5rem] rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 cursor-text hover:border-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-500
        [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1
        [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1
        [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1
        [&_p]:my-1.5 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5
        [&_code]:rounded [&_code]:bg-gray-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
        [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-gray-900 [&_pre]:p-2 [&_pre_code]:p-0
        [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:text-gray-400
        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
    >
      {value.trim() ? (
        <ReactMarkdown
          disallowedElements={["img"]}
          components={{ a: ({ children }) => <span className="text-blue-400">{children}</span> }}
        >
          {value}
        </ReactMarkdown>
      ) : (
        <span className="text-gray-500">Add a description…</span>
      )}
    </div>
  );
}
