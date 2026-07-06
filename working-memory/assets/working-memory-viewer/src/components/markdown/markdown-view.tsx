"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownViewProps = {
  markdown: string;
  compact?: boolean;
  readable?: boolean;
};

export function MarkdownView({ markdown, compact = false, readable = false }: MarkdownViewProps) {
  const className = readable
    ? "markdown markdown-readable"
    : compact
      ? "markdown markdown-compact"
      : "markdown";

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}
