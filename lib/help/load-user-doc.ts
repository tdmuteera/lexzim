import "server-only";

import { readFile } from "fs/promises";
import path from "path";
import { getUserDocMeta, type UserDocSlug } from "@/lib/help/user-docs";

/**
 * Minimal Markdown → safe-ish HTML for in-app Help.
 * Supports headings, paragraphs, lists, tables, bold/italic, inline code, links, hr.
 */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inTable = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      html.push("</tbody></table>");
      inTable = false;
    }
  };

  const inline = (text: string): string => {
    let s = escapeHtml(text);
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
      const safeHref = sanitizeHref(String(href));
      return safeHref
        ? `<a href="${safeHref}">${label}</a>`
        : label;
    });
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return s;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      closeLists();
      closeTable();
      i += 1;
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      closeLists();
      closeTable();
      html.push("<hr />");
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      closeLists();
      closeTable();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeLists();
      const cells = splitTableRow(trimmed);
      const next = (lines[i + 1] ?? "").trim();

      if (!inTable) {
        html.push('<table class="help-table"><thead><tr>');
        for (const c of cells) html.push(`<th>${inline(c)}</th>`);
        html.push("</tr></thead><tbody>");
        inTable = true;
        i += 1;
        if (looksLikeSeparator(next)) {
          i += 1;
        }
        continue;
      }

      if (looksLikeSeparator(trimmed)) {
        i += 1;
        continue;
      }

      html.push("<tr>");
      for (const c of cells) html.push(`<td>${inline(c)}</td>`);
      html.push("</tr>");
      i += 1;
      continue;
    }

    closeTable();

    const ul = /^[-*]\s+(.+)$/.exec(trimmed);
    if (ul) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      i += 1;
      continue;
    }

    const ol = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (ol) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      i += 1;
      continue;
    }

    closeLists();
    html.push(`<p>${inline(trimmed)}</p>`);
    i += 1;
  }

  closeLists();
  closeTable();
  return html.join("\n");
}

function splitTableRow(line: string): string[] {
  return line
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

function looksLikeSeparator(line: string): boolean {
  if (!line.startsWith("|")) return false;
  const inner = line.slice(1, -1);
  return /^[\s|:-]+$/.test(inner);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeHref(href: string): string | null {
  const t = href.trim();
  if (t.startsWith("/") || t.startsWith("#")) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[A-Za-z0-9_.-]+\.md$/i.test(t)) {
    // Sibling doc filename → in-app slug if known
    const map: Record<string, string> = {
      "Getting_Started_Web.md": "/help/getting-started",
      "Admin_Guide.md": "/help/admin",
      "Daily_Lawyer_Guide.md": "/help/daily",
      "Clients_KYC_Guide.md": "/help/clients-kyc",
      "CRM_Guide.md": "/help/crm",
      "Finance_Desk_Quickstart.md": "/help/finance",
      "Finance_Phase7_Guide.md": "/help/finance-gl",
      "Finance_Phase11_Guide.md": "/help/finance-depth",
      "Billing_Trust_Quickstart.md": "/help/billing",
      "Email_Setup.md": "/help/email",
      "Security_Password_Policy.md": "/help/security",
      "AI_Assistant_Guide.md": "/help/ai",
      "FAQ.md": "/help/faq",
      "README.md": "/help",
    };
    return map[t] ?? null;
  }
  return null;
}

export async function loadUserDocMarkdown(slug: UserDocSlug): Promise<string> {
  const meta = getUserDocMeta(slug);
  if (!meta) throw new Error(`Unknown help slug: ${slug}`);

  const filePath = path.join(process.cwd(), "docs", "user", meta.fileName);
  return readFile(filePath, "utf8");
}

export async function loadUserDocHtml(slug: UserDocSlug): Promise<{
  title: string;
  html: string;
  fileName: string;
  appHref: string;
}> {
  const meta = getUserDocMeta(slug);
  if (!meta) throw new Error(`Unknown help slug: ${slug}`);
  const md = await loadUserDocMarkdown(slug);
  return {
    title: meta.title,
    html: markdownToHtml(md),
    fileName: meta.fileName,
    appHref: meta.appHref,
  };
}
