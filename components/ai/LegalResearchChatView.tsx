"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/ai/ChatMarkdown";
import { MatterSearchPicker } from "@/components/ai/MatterSearchPicker";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  CORE_PRACTICE_NOTE,
  connectivityBanner,
  fetchAiJsonWithRetry,
  humanAiError,
  type AiConnectivityState,
} from "@/lib/ai/ux";
import { formatDateTime } from "@/lib/format/dates";

const ATTACH_MAX_FILES_UI = 30;
const ATTACH_MAX_BYTES_UI = 25 * 1024 * 1024;

type AssistantMode = "legal_research" | "matter_assist";

type Citation = {
  citationLabel: string;
  title?: string;
  excerpt?: string;
  sourceUrl?: string | null;
  verified?: boolean;
  verificationStatus?: string;
};

type ExploreSource = {
  category: "statute" | "case_law" | "treaty" | "secondary";
  title: string;
  relevance: string;
  sourceUrl: string;
};

type ResearchStatus = {
  webConsulted?: boolean;
  webUnavailable?: boolean;
  currentnessChecked?: boolean;
  currentnessUnverified?: boolean;
  fabricatedRejected?: boolean;
  verifiedPrimary?: boolean;
};

type ChatBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: string | null;
  notFound?: boolean;
  citations?: Citation[];
  supportingSources?: Citation[];
  exploreSources?: ExploreSource[];
  document?: { id: string; fileName: string; font?: string; lineSpacing?: number } | null;
  grounding?: "strong" | "weak" | "unsupported" | "skipped" | null;
  showDisclaimer?: boolean;
  researchStatus?: ResearchStatus | null;
  failoverNotice?: string | null;
};

function researchStatusFromMeta(
  meta: Record<string, unknown> | null | undefined,
): ResearchStatus | null {
  const verify = meta?.verify;
  const fromVerify =
    verify && typeof verify === "object"
      ? (verify as Record<string, unknown>).researchStatus
      : null;
  const raw = (fromVerify ?? meta?.researchStatus) as ResearchStatus | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  return raw;
}

type ConversationItem = {
  id: string;
  title: string | null;
  matterId?: string | null;
  updatedAt: string;
};

type MatterOption = {
  id: string;
  title: string;
  matterNumber: string | null;
  status: string;
  areaOfLaw: string;
  clientDisplayName: string;
};

type MatterHeader = {
  title: string;
  matterNumber: string | null;
  status: string;
  areaOfLaw: string;
  clientDisplayName: string;
};

type AiStatus = {
  keyStatus: "missing" | "present";
  connectivity: AiConnectivityState;
  connectivityMessage?: string;
  probed: boolean;
  packVersion: string;
  systemChunkCount: number;
  embeddingCount: number;
  embeddingsReady: boolean;
  canSendLegalResearch: boolean;
  canSendMatterAssist: boolean;
  sendBlockedReason: string | null;
  corePracticeNote?: string;
};

function confidenceFromMeta(
  confidence: number | null | undefined,
  meta: Record<string, unknown> | null | undefined,
): {
  label: string | null;
  notFound: boolean;
  grounding: ChatBubble["grounding"];
  showDisclaimer: boolean;
} {
  const notFound = Boolean(meta?.notFound);
  const label =
    typeof meta?.confidenceLabel === "string"
      ? meta.confidenceLabel
      : confidence == null
        ? null
        : confidence >= 0.8
          ? "high"
          : confidence >= 0.5
            ? "medium"
            : "low";
  const groundingRaw = meta?.grounding;
  const grounding =
    groundingRaw === "strong" ||
    groundingRaw === "weak" ||
    groundingRaw === "unsupported" ||
    groundingRaw === "skipped"
      ? groundingRaw
      : null;
  const intent = typeof meta?.intent === "string" ? meta.intent : null;
  const showCitations = Boolean(meta?.showCitations);
  const showDisclaimer =
    intent === "legal" ||
    showCitations ||
    grounding === "weak" ||
    grounding === "unsupported" ||
    grounding === "strong";
  return { label, notFound, grounding, showDisclaimer };
}

const LEGAL_FOOTER_DISCLAIMER =
  "Assistive only. Verify authorities against primary sources before relying on this answer. LexZim does not guarantee correctness.";

function buildCopyText(message: ChatBubble): string {
  let text = message.content.trim();
  if (message.citations && message.citations.length > 0) {
    const lines = message.citations.map((c) => `- ${c.citationLabel}`);
    text += `\n\nSources:\n${lines.join("\n")}`;
  }
  return text;
}

function CopyTextButton({
  text,
  className = "ai-copy-btn",
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const payload = text.trim();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = payload;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        /* ignore clipboard failures */
      }
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => void onCopy()}
      aria-label="Copy message"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyAssistantButton({ message }: { message: ChatBubble }) {
  return <CopyTextButton text={buildCopyText(message)} />;
}

function DownloadDraftButton({
  document,
}: {
  document: { id: string; fileName: string; font?: string; lineSpacing?: number };
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ai/drafts/${document.id}`, {
        method: "GET",
        credentials: "include",
      });
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || contentType.includes("application/json")) {
        let message = "Could not download that Word file.";
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch {
          /* keep default */
        }
        toast(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = document.fileName || "document.docx";
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast("Could not download that Word file. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <p className="ai-doc-link">
      <button
        type="button"
        className="ai-doc-download-btn"
        disabled={busy}
        onClick={() => void onDownload()}
      >
        {busy ? "Preparing download…" : `Download ${document.fileName}`}
      </button>
      {document.font ? (
        <span className="muted">
          {" "}
          ({document.font}
          {document.lineSpacing ? `, ${document.lineSpacing} spacing` : ""})
        </span>
      ) : null}
    </p>
  );
}

function pickRecorderMime(): { mimeType: string; fileName: string } {
  const candidates: Array<{ mimeType: string; fileName: string }> = [
    { mimeType: "audio/webm;codecs=opus", fileName: "recording.webm" },
    { mimeType: "audio/webm", fileName: "recording.webm" },
    { mimeType: "audio/mp4", fileName: "recording.mp4" },
    { mimeType: "audio/aac", fileName: "recording.m4a" },
    { mimeType: "audio/ogg;codecs=opus", fileName: "recording.ogg" },
  ];
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "", fileName: "recording.webm" };
  }
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    } catch {
      /* ignore */
    }
  }
  return { mimeType: "", fileName: "recording.webm" };
}

function CitationsList({
  messageId,
  prefix,
  citations,
}: {
  messageId: string;
  prefix: string;
  citations: Citation[];
}) {
  return (
    <ul>
      {citations.map((c, i) => (
        <li key={`${messageId}-${prefix}-c-${i}`}>
          {c.sourceUrl ? (
            <a href={c.sourceUrl} target="_blank" rel="noreferrer">
              {c.citationLabel}
            </a>
          ) : (
            <span>{c.citationLabel}</span>
          )}
          {c.verified === false ? (
            c.verificationStatus === "web_consulted" ? (
              <span className="muted"> (web — confirm on site)</span>
            ) : c.verificationStatus === "requires_verification" ? (
              <span className="muted"> (verify on publisher site)</span>
            ) : null
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function PrimarySourcesBlock({
  messageId,
  citations,
}: {
  messageId: string;
  citations: Citation[];
}) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;

  return (
    <div className="ai-citations">
      <div className="ai-citations-head">
        <div className="label">Show sources</div>
        <button
          type="button"
          className="ai-sources-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <p className="ai-citations-note muted">
        Acts, statutes, and authorities named in this answer. Click to verify on the publisher site.
      </p>
      {open ? <CitationsList messageId={messageId} prefix="p" citations={citations} /> : null}
    </div>
  );
}

function SupportingSourcesBlock({
  messageId,
  citations,
}: {
  messageId: string;
  citations: Citation[];
}) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;

  return (
    <div className="ai-citations ai-supporting">
      <div className="ai-citations-head">
        <div className="label">Other sources consulted</div>
        <button
          type="button"
          className="ai-sources-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <p className="ai-citations-note muted">
        Web pages browsed this turn that informed the answer but are not primary legislation.
      </p>
      {open ? <CitationsList messageId={messageId} prefix="s" citations={citations} /> : null}
    </div>
  );
}

const EXPLORE_CATEGORY_LABEL: Record<ExploreSource["category"], string> = {
  statute: "Statutes",
  case_law: "Case law",
  treaty: "Treaties / international instruments",
  secondary: "Secondary sources",
};

function ExploreSourcesBlock({
  messageId,
  sources,
}: {
  messageId: string;
  sources: ExploreSource[];
}) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;

  const byCategory = (Object.keys(EXPLORE_CATEGORY_LABEL) as ExploreSource["category"][])
    .map((category) => ({
      category,
      items: sources.filter((s) => s.category === category),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="ai-citations ai-explore">
      <div className="ai-citations-head">
        <div className="label">Sources worth looking into</div>
        <button
          type="button"
          className="ai-sources-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <p className="ai-citations-note muted">
        Related reading and follow-up links. Not necessarily cited in the answer above.
      </p>
      {open ? (
        <div className="ai-explore-body">
          {byCategory.map((group) => (
            <div key={`${messageId}-${group.category}`} className="ai-explore-group">
              <div className="ai-explore-cat">{EXPLORE_CATEGORY_LABEL[group.category]}</div>
              <ul>
                {group.items.map((s, i) => (
                  <li key={`${messageId}-e-${group.category}-${i}`}>
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                    {s.relevance ? (
                      <div className="ai-citation-hint muted">{s.relevance}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LegalResearchChatView() {
  const { toast } = useToast();
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<AssistantMode>("legal_research");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [question, setQuestion] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [micState, setMicState] = useState<"idle" | "recording" | "transcribing">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [matterId, setMatterId] = useState("");
  const [matterHeader, setMatterHeader] = useState<MatterHeader | null>(null);
  const [matterDocs, setMatterDocs] = useState<Array<{ id: string; title: string; fileName: string }>>(
    [],
  );
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [queuedQuestion, setQueuedQuestion] = useState<string | null>(null);
  const queuedRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const matterIdRef = useRef("");
  const modeRef = useRef<AssistantMode>(mode);
  const selectedDocumentIdsRef = useRef<string[]>([]);
  const pendingFilesRef = useRef<File[]>([]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    matterIdRef.current = matterId;
  }, [matterId]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    selectedDocumentIdsRef.current = selectedDocumentIds;
  }, [selectedDocumentIds]);
  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  const loadStatus = useCallback(async (probe = true) => {
    try {
      const qs = probe ? "?probe=1" : "";
      const res = await fetch(`/api/ai/status${qs}`, { credentials: "include" });
      const body = (await res.json()) as { ok: boolean; data?: AiStatus };
      if (res.ok && body.ok && body.data) setStatus(body.data);
    } catch {
      /* non-blocking */
    }
  }, []);

  const loadConversations = useCallback(async (activeMode: AssistantMode) => {
    setLoadingList(true);
    try {
      const res = await fetch(`/api/ai/conversations?mode=${activeMode}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ConversationItem[] };
      };
      if (res.ok && body.ok && body.data) setConversations(body.data.items);
    } catch {
      /* keep previous */
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadMatters = useCallback(async () => {
    try {
      const res = await fetch("/api/matters?bucket=all", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items?: MatterOption[] };
      };
      if (!res.ok || !body.ok || !body.data?.items) return;
      const items = body.data.items;
      setMatters(items);
    } catch {
      /* non-blocking */
    }
  }, []);

  const loadMatterDocuments = useCallback(async (id: string) => {
    if (!id) {
      setMatterDocs([]);
      setSelectedDocumentIds([]);
      return;
    }
    try {
      const res = await fetch(`/api/matters/${id}/documents`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items?: Array<{ id: string; title: string; fileName: string }> };
      };
      if (!res.ok || !body.ok || !body.data?.items) {
        setMatterDocs([]);
        return;
      }
      setMatterDocs(
        body.data.items.map((d) => ({
          id: d.id,
          title: d.title,
          fileName: d.fileName,
        })),
      );
    } catch {
      setMatterDocs([]);
    }
  }, []);

  useEffect(() => {
    void loadStatus(true);
  }, [loadStatus]);

  useEffect(() => {
    void loadConversations(mode);
    if (mode === "matter_assist") void loadMatters();
  }, [mode, loadConversations, loadMatters]);

  useEffect(() => {
    if (mode !== "matter_assist") {
      setMatterDocs([]);
      setSelectedDocumentIds([]);
      return;
    }
    setSelectedDocumentIds([]);
    void loadMatterDocuments(matterId);
  }, [mode, matterId, loadMatterDocuments]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (mode !== "matter_assist") return;
    const selected = matters.find((m) => m.id === matterId);
    if (selected) {
      setMatterHeader({
        title: selected.title,
        matterNumber: selected.matterNumber,
        status: selected.status,
        areaOfLaw: selected.areaOfLaw,
        clientDisplayName: selected.clientDisplayName,
      });
    }
  }, [mode, matterId, matters]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function switchMode(next: AssistantMode) {
    if (next === mode) return;
    setMode(next);
    setConversationId(null);
    setMessages([]);
    setError(null);
    setQuestion("");
  }

  function onNewChat() {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setQuestion("");
    setEditingId(null);
    setEditDraft("");
  }

  async function deleteConversationById(id: string, e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    if (
      !window.confirm(
        "Permanently delete this conversation? This cannot be undone.",
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not delete conversation.");
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationIdRef.current === id) {
        onNewChat();
      }
    } catch {
      setError("Could not delete conversation.");
    }
  }

  async function openConversation(id: string) {
    setLoadingThread(true);
    setError(null);
    setConversationId(id);
    setEditingId(null);
    setEditDraft("");
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          conversation: { mode: string; matterId: string | null };
          messages: Array<{
            id: string;
            role: string;
            content: string;
            confidence: number | null;
            citationsJson: Citation[];
            retrievalMetaJson: Record<string, unknown>;
          }>;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(humanAiError(body.error?.message, res.status));
        return;
      }
      if (body.data.conversation.matterId) {
        setMatterId(body.data.conversation.matterId);
      }
      setMessages(
        body.data.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => {
            const conf = confidenceFromMeta(m.confidence, m.retrievalMetaJson);
            const rawCitations = Array.isArray(m.citationsJson) ? m.citationsJson : [];
            const tiers = m.retrievalMetaJson?.sourceTiers as
              | { primary?: Citation[]; supporting?: Citation[]; furtherReading?: ExploreSource[] }
              | undefined;
            const citations =
              conf.grounding === "skipped" ||
              (typeof m.retrievalMetaJson?.intent === "string" &&
                m.retrievalMetaJson.intent === "chat")
                ? []
                : (tiers?.primary ?? rawCitations);
            const supportingSources =
              conf.grounding === "skipped" || m.retrievalMetaJson?.intent === "chat"
                ? []
                : (tiers?.supporting ?? []);
            return {
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              confidence: conf.label,
              notFound: conf.notFound,
              citations,
              supportingSources,
              exploreSources: Array.isArray(tiers?.furtherReading)
                ? tiers.furtherReading
                : Array.isArray(m.retrievalMetaJson?.exploreSources)
                  ? (m.retrievalMetaJson.exploreSources as ExploreSource[])
                  : [],
              grounding: conf.grounding,
              showDisclaimer: m.role === "assistant" ? conf.showDisclaimer : false,
              document:
                m.retrievalMetaJson &&
                typeof m.retrievalMetaJson === "object" &&
                m.retrievalMetaJson.document &&
                typeof m.retrievalMetaJson.document === "object"
                  ? (m.retrievalMetaJson.document as ChatBubble["document"])
                  : null,
              researchStatus: researchStatusFromMeta(m.retrievalMetaJson),
              failoverNotice:
                typeof m.retrievalMetaJson?.failoverNotice === "string"
                  ? m.retrievalMetaJson.failoverNotice
                  : null,
            };
          }),
      );
    } catch {
      setError("Could not load that conversation.");
    } finally {
      setLoadingThread(false);
    }
  }

  const sendBlocked =
    mode === "legal_research"
      ? Boolean(status && !status.canSendLegalResearch)
      : Boolean(status && !status.canSendMatterAssist);
  const sendBlockedReason =
    mode === "legal_research"
      ? status?.sendBlockedReason
      : status && !status.canSendMatterAssist
        ? status.sendBlockedReason
        : null;

  async function runAsk(q: string) {
    const activeMode = modeRef.current;
    const activeMatterId = matterIdRef.current;
    const activeConversationId = conversationIdRef.current;
    const activeDocIds = selectedDocumentIdsRef.current;
    const filesToExtract = pendingFilesRef.current;

    setLoading(true);
    loadingRef.current = true;
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${Date.now()}`, role: "user", content: q },
    ]);

    try {
      let attachmentContext: string | null = null;
      if (filesToExtract.length) {
        setExtracting(true);
        try {
          const oversized = filesToExtract.filter((f) => f.size > ATTACH_MAX_BYTES_UI);
          if (oversized.length) {
            throw new Error(
              `${oversized[0]!.name} is larger than 25 MB. Compress it or split the pages.`,
            );
          }
          if (filesToExtract.length > ATTACH_MAX_FILES_UI) {
            throw new Error(`Attach at most ${ATTACH_MAX_FILES_UI} files at a time.`);
          }
          const form = new FormData();
          for (const file of filesToExtract) form.append("files", file);
          const extracted = await fetch("/api/ai/extract", {
            method: "POST",
            credentials: "include",
            body: form,
          });
          let extractedBody: {
            ok?: boolean;
            data?: { files?: Array<{ fileName: string; method: string; text: string }> };
            error?: { message?: string };
          } = {};
          try {
            extractedBody = (await extracted.json()) as typeof extractedBody;
          } catch {
            throw new Error(
              "Could not read attached files (upload may be too large). Try fewer or smaller files.",
            );
          }
          if (!extracted.ok || !extractedBody.ok) {
            throw new Error(
              extractedBody.error?.message || "Could not read attached files.",
            );
          }
          const files = extractedBody.data?.files ?? [];
          if (!files.length) {
            throw new Error("No text could be extracted from the attached files.");
          }
          attachmentContext = files
            .map((f) => `--- ${f.fileName} (${f.method}) ---\n${f.text}`)
            .join("\n\n");
          setPendingFiles([]);
          pendingFilesRef.current = [];
        } finally {
          setExtracting(false);
        }
      }

      const endpoint = activeMode === "matter_assist" ? "/api/ai/matter-ask" : "/api/ai/ask";
      const payload =
        activeMode === "matter_assist"
          ? {
              question: q,
              conversationId: activeConversationId,
              matterId: activeMatterId,
              attachmentContext,
              selectedDocumentIds: activeDocIds,
            }
          : { question: q, conversationId: activeConversationId, attachmentContext };

      const res = await fetchAiJsonWithRetry(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          conversationId: string;
          assistantMessageId: string;
          answer: string;
          confidence: string;
          citations: Citation[];
          notFound: boolean;
          disclaimer?: string;
          matterHeader?: MatterHeader;
          document?: { id: string; fileName: string; font?: string; lineSpacing?: number } | null;
          grounding?: "strong" | "weak" | "unsupported" | "skipped";
          exploreSources?: ExploreSource[];
          sourceTiers?: {
            primary?: Citation[];
            supporting?: Citation[];
            furtherReading?: ExploreSource[];
          };
          retrievalMeta?: {
            errorCode?: string;
            emptyReason?: string | null;
            grounding?: string;
            intent?: string;
            showCitations?: boolean;
            exploreSources?: ExploreSource[];
            failoverNotice?: string | null;
          };
        };
        error?: { message: string };
      };

      if (!res.ok || !body.ok || !body.data) {
        const msg = humanAiError(body.error?.message, res.status);
        setError(msg);
        toast(msg);
        void loadStatus(true);
        return;
      }

      setConversationId(body.data.conversationId);
      conversationIdRef.current = body.data.conversationId;
      if (body.data.matterHeader) setMatterHeader(body.data.matterHeader);
      const grounding =
        body.data.grounding ??
        (body.data.retrievalMeta?.grounding as ChatBubble["grounding"]) ??
        null;
      const intent = body.data.retrievalMeta?.intent;
      const showCitations = body.data.retrievalMeta?.showCitations;
      const tiers = body.data.sourceTiers;
      const hideSources =
        intent === "chat" ||
        grounding === "skipped" ||
        showCitations === false;
      const citations = hideSources
        ? []
        : tiers?.primary ?? body.data.citations ?? [];
      const supportingSources = hideSources ? [] : tiers?.supporting ?? [];
      const exploreSources = hideSources
        ? []
        : tiers?.furtherReading ??
          body.data.exploreSources ??
          body.data.retrievalMeta?.exploreSources ??
          [];
      const failoverNotice = body.data.retrievalMeta?.failoverNotice ?? null;
      const showDisclaimer = activeMode === "matter_assist" &&
        (citations.length > 0 ||
          grounding === "weak" ||
          grounding === "unsupported");
      setMessages((prev) => [
        ...prev,
        {
          id: body.data!.assistantMessageId,
          role: "assistant",
          content: body.data!.answer,
          confidence: body.data!.confidence,
          notFound: body.data!.notFound,
          citations,
          supportingSources,
          exploreSources,
          grounding,
          showDisclaimer,
          document: body.data!.document ?? null,
          researchStatus: researchStatusFromMeta(
            (body.data!.retrievalMeta as Record<string, unknown> | undefined) ?? null,
          ),
          failoverNotice,
        },
      ]);

      void loadConversations(activeMode);
      void loadStatus(false);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const msg =
        raw && !/network error/i.test(raw)
          ? humanAiError(raw)
          : humanAiError("network error", 503);
      setError(msg);
      toast(msg);
      void loadStatus(true);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setExtracting(false);
      const next = queuedRef.current;
      if (next) {
        queuedRef.current = null;
        setQueuedQuestion(null);
        window.setTimeout(() => {
          void runAsk(next);
        }, 0);
      }
    }
  }

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    if (mode === "matter_assist" && !matterId) {
      setError("Select a matter first.");
      return;
    }
    if (sendBlocked) {
      const msg = sendBlockedReason || humanAiError("AI unavailable");
      setError(msg);
      toast(msg);
      return;
    }

    if (loadingRef.current) {
      queuedRef.current = q;
      setQueuedQuestion(q);
      setQuestion("");
      return;
    }

    setQuestion("");
    await runAsk(q);
  }

  function startEdit(message: ChatBubble) {
    if (loading || message.role !== "user" || message.id.startsWith("local-")) return;
    setEditingId(message.id);
    setEditDraft(message.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEditAndRegenerate() {
    if (!conversationId || !editingId || loading) return;
    const content = editDraft.trim();
    if (!content) {
      setError("Message cannot be empty.");
      return;
    }
    if (sendBlocked) {
      const msg = sendBlockedReason || humanAiError("AI unavailable");
      setError(msg);
      toast(msg);
      return;
    }

    setLoading(true);
    setError(null);
    const messageId = editingId;
    setEditingId(null);
    setEditDraft("");

    try {
      const res = await fetchAiJsonWithRetry(
        `/api/ai/conversations/${conversationId}/regenerate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, content }),
        },
      );
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        const msg = humanAiError(body.error?.message, res.status);
        setError(msg);
        toast(msg);
        void loadStatus(true);
        return;
      }
      await openConversation(conversationId);
      void loadConversations(mode);
      void loadStatus(false);
    } catch {
      const msg = humanAiError("network error", 503);
      setError(msg);
      toast(msg);
      void loadStatus(true);
    } finally {
      setLoading(false);
    }
  }

  function stopMediaTracks() {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }

  async function toggleMic() {
    if (loading || extracting || sendBlocked || micState === "transcribing") return;

    if (micState === "recording") {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone recording.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Microphone needs a secure (HTTPS) connection. Open LexZim over https and try again.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Try Chrome, Edge, or Safari on a recent phone.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];
      const picked = pickRecorderMime();
      const recorder = picked.mimeType
        ? new MediaRecorder(stream, { mimeType: picked.mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const uploadName = picked.fileName;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        void (async () => {
          setMicState("transcribing");
          stopMediaTracks();
          const blobType = recorder.mimeType || picked.mimeType || "audio/webm";
          const blob = new Blob(mediaChunksRef.current, { type: blobType });
          mediaChunksRef.current = [];
          mediaRecorderRef.current = null;
          try {
            if (blob.size < 256) {
              const msg = "Recording was too short. Hold Mic a moment, then tap again to stop.";
              setError(msg);
              toast(msg);
              return;
            }
            const form = new FormData();
            form.append("file", blob, uploadName);
            const res = await fetch("/api/ai/transcribe", {
              method: "POST",
              credentials: "include",
              body: form,
            });
            let body: {
              ok: boolean;
              data?: { text?: string };
              error?: { message?: string };
            } = { ok: false };
            try {
              body = (await res.json()) as typeof body;
            } catch {
              const msg = "Transcription service returned an unexpected response.";
              setError(msg);
              toast(msg);
              return;
            }
            if (!res.ok || !body.ok || !body.data?.text) {
              const msg =
                body.error?.message ||
                "Transcription failed. Check OpenAI key under Settings → AI.";
              setError(msg);
              toast(msg);
              return;
            }
            setQuestion((prev) => {
              const next = body.data!.text!.trim();
              if (!prev.trim()) return next;
              return `${prev.trim()} ${next}`;
            });
            setError(null);
          } catch {
            const msg = "Could not reach the transcription service.";
            setError(msg);
            toast(msg);
          } finally {
            setMicState("idle");
          }
        })();
      };

      // timeslice helps mobile browsers flush audio chunks before stop
      recorder.start(1000);
      setMicState("recording");
      setError(null);
    } catch (err) {
      stopMediaTracks();
      setMicState("idle");
      const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
      const msg =
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Microphone was blocked. Allow mic for this LexZim site in browser/app settings, reload, then try again."
          : name === "NotFoundError"
            ? "No microphone found on this device."
            : name === "NotReadableError" || name === "AbortError"
              ? "Microphone is busy or unavailable. Close other apps using the mic, then try again."
              : "Could not start recording.";
      setError(msg);
      toast(msg);
    }
  }

  const keyMissing = status?.keyStatus === "missing";
  const connBanner = connectivityBanner(status?.connectivity);

  return (
    <div className="view active ai-chat" aria-label="AI Assistant">
      <div className="ai-chat-toolbar">
        <div>
          <h1>AI Legal Assistant</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {mode === "legal_research"
              ? "Talk naturally. Legal answers stay cautious and only show sources when they matter."
              : "Search a matter, then ask about the file. Drafts and ordinary chat are fine."}
          </p>
          <div className="ai-chip-row" style={{ marginTop: "0.55rem" }}>
            <div className="ai-mode-tabs" role="tablist" aria-label="Assistant mode">
              <button
                type="button"
                className={mode === "legal_research" ? "active" : undefined}
                role="tab"
                aria-selected={mode === "legal_research"}
                onClick={() => switchMode("legal_research")}
              >
                Legal Research
              </button>
              <button
                type="button"
                className={mode === "matter_assist" ? "active" : undefined}
                role="tab"
                aria-selected={mode === "matter_assist"}
                onClick={() => switchMode("matter_assist")}
              >
                Matter Assist
              </button>
            </div>
            {status ? (
              <>
                <span className="ai-chip" title="Knowledge pack version">
                  KB {status.packVersion}
                </span>
                <span className={status.embeddingsReady ? "ai-chip" : "ai-chip warn"}>
                  {status.embeddingsReady
                    ? `${status.embeddingCount} embeddings`
                    : "embeddings not ready"}
                </span>
                {status.connectivity === "ready" ? (
                  <span className="ai-chip">AI ready</span>
                ) : keyMissing ? (
                  <span className="ai-chip danger">API key missing</span>
                ) : status.connectivity === "unreachable" ? (
                  <span className="ai-chip danger">AI unreachable</span>
                ) : status.connectivity === "rate_limited" ? (
                  <span className="ai-chip warn">Rate limited</span>
                ) : status.connectivityMessage ? (
                  <span className="ai-chip warn" title={status.connectivityMessage}>
                    AI setup issue
                  </span>
                ) : (
                  <span className="ai-chip warn">AI {status.connectivity}</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadStatus(true)}
                  title="Re-check AI connectivity"
                >
                  Recheck
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onNewChat}>
          New chat
        </Button>
      </div>

      <div className="ai-layout">
        <aside className="ai-sidebar">
          <div className="ai-sidebar-head">
            <strong>Conversations</strong>
            <Button variant="ghost" size="sm" onClick={() => void loadConversations(mode)}>
              Refresh
            </Button>
          </div>
          <div className="ai-conv-list">
            {loadingList ? (
              <p className="muted" style={{ margin: "0.5rem", fontSize: "0.85rem" }}>
                Loading…
              </p>
            ) : conversations.length === 0 ? (
              <p className="muted" style={{ margin: "0.5rem", fontSize: "0.85rem" }}>
                No chats yet. Ask a question to start.
              </p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`ai-conv-row${conversationId === c.id ? " active" : ""}`}
                >
                  <button
                    type="button"
                    className={`ai-conv-item${conversationId === c.id ? " active" : ""}`}
                    onClick={() => void openConversation(c.id)}
                  >
                    <div className="title">{c.title?.trim() || "Untitled chat"}</div>
                    <div className="meta">{formatDateTime(c.updatedAt)}</div>
                  </button>
                  <button
                    type="button"
                    className="ai-conv-delete"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                    onClick={(e) => void deleteConversationById(c.id, e)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="ai-main">
          <div className="ai-main-head">
            <strong>
              {mode === "legal_research" ? "Conversation" : "Matter conversation"}
            </strong>
            {loadingThread ? (
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Loading thread…
              </span>
            ) : null}
          </div>

          {mode === "matter_assist" ? (
            <>
              <div className="ai-matter-picker">
                <MatterSearchPicker
                  value={matterId}
                  disabled={loading}
                  onChange={(id, option) => {
                    setMatterId(id);
                    setConversationId(null);
                    setMessages([]);
                    setError(null);
                    if (option) {
                      setMatterHeader({
                        title: option.title,
                        matterNumber: option.matterNumber,
                        status: option.status,
                        areaOfLaw: option.areaOfLaw,
                        clientDisplayName: option.clientDisplayName,
                      });
                    }
                  }}
                />
              </div>
              {matterHeader ? (
                <div className="ai-matter-strip">
                  <div>
                    <div className="label">Active matter</div>
                    <div className="title">
                      {matterHeader.matterNumber
                        ? `${matterHeader.matterNumber} · ${matterHeader.title}`
                        : matterHeader.title}
                    </div>
                  </div>
                  <div className="meta">Client: {matterHeader.clientDisplayName}</div>
                  <div className="meta">
                    {matterHeader.areaOfLaw} · {matterHeader.status}
                  </div>
                </div>
              ) : null}
              {matterId ? (
                <div className="ai-matter-docs" style={{ marginTop: "0.75rem" }}>
                  <div className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
                    Include matter documents in this question
                  </div>
                  {!matterDocs.length ? (
                    <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
                      No documents on this matter yet.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                        maxHeight: "8rem",
                        overflow: "auto",
                      }}
                    >
                      {matterDocs.map((doc) => {
                        const checked = selectedDocumentIds.includes(doc.id);
                        return (
                          <label
                            key={doc.id}
                            className="checkbox-row"
                            style={{ fontSize: "0.85rem" }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedDocumentIds((prev) =>
                                  checked
                                    ? prev.filter((id) => id !== doc.id)
                                    : [...prev, doc.id],
                                );
                              }}
                            />
                            <span>
                              {doc.title}
                              <span className="muted"> · {doc.fileName}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="ai-transcript" ref={transcriptRef}>
            {connBanner ? (
              <div
                className={`ai-banner ${connBanner.tone === "danger" ? "danger" : "warn"}`}
                role="status"
              >
                {status?.connectivityMessage && connBanner.tone === "warn"
                  ? status.connectivityMessage
                  : connBanner.text}
              </div>
            ) : null}
            {sendBlocked && sendBlockedReason ? (
              <div className="ai-banner warn" role="status">
                Send disabled: {sendBlockedReason}
              </div>
            ) : null}
            {connBanner || sendBlocked ? (
              <div className="ai-banner warn" role="note" style={{ opacity: 0.95 }}>
                {status?.corePracticeNote ?? CORE_PRACTICE_NOTE}
              </div>
            ) : null}
            {mode === "matter_assist" && keyMissing ? (
              <div className="ai-banner warn" role="status">
                API key missing: Matter Assist still answers from live matter facts. LLM polish and
                firm-memory embeddings need the key.
              </div>
            ) : null}

            {messages.length === 0 && !loadingThread ? (
              <div className="ai-empty">
                <h2>
                  {mode === "legal_research"
                    ? "Ask anything"
                    : "Ask about this matter file"}
                </h2>
                <p>
                  {mode === "legal_research"
                    ? "Ask anything. I'm here to help."
                    : "Search for a matter, then ask about it, draft a document, or talk through the file."}
                </p>
              </div>
            ) : null}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`ai-bubble ${m.role === "user" ? "user" : "assistant"}`}
              >
                <div className="ai-bubble-head">
                  <strong>{m.role === "user" ? "You" : "LexZim"}</strong>
                  {m.role === "assistant" && m.researchStatus?.webConsulted ? (
                    <span className="ai-chip" title="Allowlisted online sources consulted">
                      web consulted
                    </span>
                  ) : null}
                  {m.role === "assistant" && m.researchStatus?.webUnavailable ? (
                    <span className="ai-chip warn" title="Online verification failed">
                      web unavailable
                    </span>
                  ) : null}
                  {m.role === "assistant" ? (
                    <CopyAssistantButton message={m} />
                  ) : editingId !== m.id ? (
                    <div className="ai-bubble-actions">
                      <CopyTextButton text={m.content} />
                      <button
                        type="button"
                        className="ai-edit-btn"
                        disabled={loading || m.id.startsWith("local-")}
                        onClick={() => startEdit(m)}
                      >
                        Edit
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="ai-bubble-body">
                  {m.role === "user" && editingId === m.id ? (
                    <div className="ai-edit-form">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        disabled={loading}
                        aria-label="Edit message"
                      />
                      <div className="ai-edit-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={loading}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="gold"
                          size="sm"
                          disabled={loading || !editDraft.trim()}
                          onClick={() => void saveEditAndRegenerate()}
                        >
                          Save &amp; regenerate
                        </Button>
                      </div>
                    </div>
                  ) : m.role === "assistant" ? (
                    <ChatMarkdown text={m.content} />
                  ) : (
                    m.content
                  )}
                </div>
                {m.document ? <DownloadDraftButton document={m.document} /> : null}
                {m.role === "assistant" && m.failoverNotice ? (
                  <div className="ai-banner warn" role="status" style={{ marginTop: "0.5rem" }}>
                    {m.failoverNotice}
                  </div>
                ) : null}
                {m.role === "assistant" && m.citations && m.citations.length > 0 ? (
                  <PrimarySourcesBlock messageId={m.id} citations={m.citations} />
                ) : null}
                {m.role === "assistant" &&
                m.supportingSources &&
                m.supportingSources.length > 0 ? (
                  <SupportingSourcesBlock
                    messageId={m.id}
                    citations={m.supportingSources}
                  />
                ) : null}
                {m.role === "assistant" &&
                m.exploreSources &&
                m.exploreSources.length > 0 ? (
                  <ExploreSourcesBlock messageId={m.id} sources={m.exploreSources} />
                ) : null}
                {mode !== "legal_research" && m.role === "assistant" && m.showDisclaimer ? (
                  <p className="ai-disclaimer muted" role="note">
                    {LEGAL_FOOTER_DISCLAIMER}
                  </p>
                ) : null}
              </div>
            ))}

            {loading ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                {mode === "matter_assist"
                  ? "Reading the file…"
                  : extracting
                    ? "Reading attached files…"
                    : "Thinking…"}
              </p>
            ) : null}

            {error ? (
              <p className="ai-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <form className="ai-composer" onSubmit={(e) => void onAsk(e)}>
            <div className="ai-composer-main">
              {pendingFiles.length > 0 ? (
                <div className="ai-attach-chips">
                  {pendingFiles.map((f) => (
                    <span key={`${f.name}-${f.size}`} className="ai-chip">
                      {f.name}
                    </span>
                  ))}
                  <button type="button" className="ai-attach-clear" onClick={() => setPendingFiles([])}>
                    Clear
                  </button>
                </div>
              ) : null}
              {queuedQuestion ? (
                <div className="ai-attach-chips">
                  <span className="ai-chip">Queued next message</span>
                  <button
                    type="button"
                    className="ai-attach-clear"
                    onClick={() => {
                      queuedRef.current = null;
                      setQueuedQuestion(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                sendBlocked
                  ? "AI send is disabled until connectivity is restored…"
                  : mode === "matter_assist"
                    ? "Ask about this matter, or talk normally…"
                    : "Message LexZim…"
              }
              rows={2}
              disabled={
                extracting ||
                sendBlocked ||
                micState !== "idle" ||
                (mode === "matter_assist" && !matterId)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            </div>
            <label className="ai-attach-btn">
              <input
                type="file"
                multiple
                hidden
                accept=".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.bmp"
                onChange={(e) => {
                  const next = Array.from(e.target.files ?? []);
                  const tooBig = next.find((f) => f.size > ATTACH_MAX_BYTES_UI);
                  if (tooBig) {
                    const msg = `${tooBig.name} is larger than 25 MB. Compress it or split the pages.`;
                    setError(msg);
                    toast(msg);
                  }
                  setPendingFiles((prev) => {
                    const merged = [...prev, ...next].slice(0, ATTACH_MAX_FILES_UI);
                    if (prev.length + next.length > ATTACH_MAX_FILES_UI) {
                      const msg = `You can attach up to ${ATTACH_MAX_FILES_UI} files at once.`;
                      setError(msg);
                      toast(msg);
                    }
                    return merged;
                  });
                  e.target.value = "";
                }}
              />
              Attach
            </label>
            <button
              type="button"
              className={`ai-mic-btn${micState === "recording" ? " recording" : ""}`}
              disabled={
                loading ||
                extracting ||
                sendBlocked ||
                micState === "transcribing" ||
                (mode === "matter_assist" && !matterId)
              }
              onClick={() => void toggleMic()}
              title="Dictate with microphone (does not auto-send)"
            >
              {micState === "recording"
                ? "Recording…"
                : micState === "transcribing"
                  ? "Transcribing…"
                  : "Mic"}
            </button>
            <Button
              type="submit"
              variant="gold"
              disabled={
                extracting ||
                sendBlocked ||
                !question.trim() ||
                micState !== "idle" ||
                (mode === "matter_assist" && !matterId)
              }
              title={sendBlocked ? sendBlockedReason ?? "AI send disabled" : undefined}
            >
              {extracting
                ? "Reading…"
                : loading
                  ? question.trim()
                    ? "Queue"
                    : "Thinking…"
                  : sendBlocked
                    ? "Unavailable"
                    : "Send"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
