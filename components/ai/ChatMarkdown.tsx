"use client";

import type { ReactNode } from "react";

/**
 * Safe ChatGPT-style markdown: headings, lists, bold, italics, links, code.
 * No raw HTML. Used so model hashes/asterisks render instead of showing as text.
 */
export function ChatMarkdown({ text }: { text: string }) {
  const blocks = splitBlocks(text.replace(/\r\n/g, "\n").trim());
  return (
    <div className="ai-md">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

type MdBlock =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; text: string }
  | { type: "p"; text: string };

function splitBlocks(src: string): MdBlock[] {
  const lines = src.split("\n");
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]?.startsWith("```")) {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      out.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      out.push({ type: "h", level, text: heading[2] });
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      out.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i] ?? "";
        const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(cur);
        if (numbered) {
          const chunks = [numbered[1]];
          i += 1;
          while (i < lines.length) {
            const nxt = lines[i] ?? "";
            if (nxt.trim() === "") {
              let j = i + 1;
              while (j < lines.length && (lines[j] ?? "").trim() === "") j += 1;
              const peek = lines[j] ?? "";
              if (
                /^\s*\d+[.)]\s+/.test(peek) ||
                /^\s*[-*]\s+/.test(peek) ||
                /^(#{1,3})\s+/.test(peek) ||
                peek.startsWith("```") ||
                peek === ""
              ) {
                i = j;
                break;
              }
              i += 1;
              continue;
            }
            if (
              /^\s*\d+[.)]\s+/.test(nxt) ||
              /^\s*[-*]\s+/.test(nxt) ||
              /^(#{1,3})\s+/.test(nxt) ||
              nxt.startsWith("```")
            ) {
              break;
            }
            chunks.push(nxt.trim());
            i += 1;
          }
          items.push(chunks.filter(Boolean).join(" "));
          continue;
        }
        if (cur.trim() === "") {
          i += 1;
          continue;
        }
        break;
      }
      if (items.length) out.push({ type: "ol", items });
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[i] ?? "") &&
      !/^\s*[-*]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+[.)]\s+/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").startsWith("```")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    out.push({ type: "p", text: para.join(" ") });
  }
  return out;
}

function Block({ block }: { block: MdBlock }) {
  if (block.type === "h") {
    if (block.level === 1) return <h2 className="ai-md-h ai-md-h1">{inline(block.text)}</h2>;
    if (block.level === 2) return <h3 className="ai-md-h ai-md-h2">{inline(block.text)}</h3>;
    return <h4 className="ai-md-h ai-md-h3">{inline(block.text)}</h4>;
  }
  if (block.type === "ul") {
    return (
      <ul className="ai-md-ul">
        {block.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol className="ai-md-ol">
        {block.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "code") {
    return <pre className="ai-md-code">{block.text}</pre>;
  }
  return <p className="ai-md-p">{inline(block.text)}</p>;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+(?:\s+"[^"]*")?\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)/.exec(token);
      if (link) {
        parts.push(
          <a key={key++} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
