"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Markdown renderer (GitHub-flavoured). react-markdown never injects raw
 * HTML from the source, so rendering user files is safe without a sanitiser.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("nx-prose", className)} data-selectable>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
