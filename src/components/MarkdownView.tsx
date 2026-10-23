import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Read-only Markdown rendering shared by the description and comments.
 * Supports GFM (tables, task lists, strikethrough) via remark-gfm; autolinked
 * URLs are still plain text. Links render as plain text and images are dropped: the app makes no
 * external requests and opens nothing outside the window (D-012).
 * Not interactive: no role, no tab stop, no editing.
 */
export function MarkdownView({ value }: { value: string }) {
  return (
    <div
      className="[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1
        [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1
        [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1
        [&_p]:my-1.5 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5
        [&_code]:rounded [&_code]:bg-gray-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
        [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-gray-900 [&_pre]:p-2 [&_pre_code]:p-0
        [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:text-gray-400
        [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm
        [&_th]:border [&_th]:border-gray-700 [&_th]:bg-gray-900 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold
        [&_td]:border [&_td]:border-gray-700 [&_td]:px-3 [&_td]:py-1.5
        [&_del]:text-gray-500
        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{ a: ({ children }) => <span className="text-blue-400">{children}</span> }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
