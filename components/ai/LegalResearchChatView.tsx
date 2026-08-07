"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
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

type AssistantMode = "legal_research" | "matter_assist";

type Citation = {
  citationLabel: string;
  title?: string;
  excerpt?: string;
  sourceUrl?: string | null;
  verified?: boolean;
};

type ChatBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: string | null;
  notFound?: boolean;
  citations?: Citation[];
};

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
): { label: string | null; notFound: boolean } {
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
  return { label, notFound };
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
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [matterId, setMatterId] = useState("");
  const [matterHeader, setMatterHeader] = useState<MatterHeader | null>(null);

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
      setMatterId((prev) => prev || items[0]?.id || "");
    } catch {
      /* non-blocking */
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
  }

  async function openConversation(id: string) {
    setLoadingThread(true);
    setError(null);
    setConversationId(id);
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
            return {
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              confidence: conf.label,
              notFound: conf.notFound,
              citations: Array.isArray(m.citationsJson) ? m.citationsJson : [],
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

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
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

    setLoading(true);
    setError(null);
    setQuestion("");
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${Date.now()}`, role: "user", content: q },
    ]);

    try {
      const endpoint = mode === "matter_assist" ? "/api/ai/matter-ask" : "/api/ai/ask";
      const payload =
        mode === "matter_assist"
          ? { question: q, conversationId, matterId }
          : { question: q, conversationId };

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
          matterHeader?: MatterHeader;
          retrievalMeta?: { errorCode?: string; emptyReason?: string | null };
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
      if (body.data.matterHeader) setMatterHeader(body.data.matterHeader);
      setMessages((prev) => [
        ...prev,
        {
          id: body.data!.assistantMessageId,
          role: "assistant",
          content: body.data!.answer,
          confidence: body.data!.confidence,
          notFound: body.data!.notFound,
          citations: body.data!.citations,
        },
      ]);

      if (body.data.notFound) toast("No grounded sources found.");
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

  const keyMissing = status?.keyStatus === "missing";
  const kbEmpty = status != null && status.systemChunkCount === 0;
  const embeddingsMissing =
    status != null && status.systemChunkCount > 0 && !status.embeddingsReady;
  const connBanner = connectivityBanner(status?.connectivity);

  return (
    <div className="view ai-chat">
      <div className="ai-chat-toolbar">
        <div>
          <h1>AI Legal Assistant</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {mode === "legal_research"
              ? "Zimbabwe legal research with citations. Not final legal advice."
              : "Read-only help for a single matter you can access. Not final legal advice."}
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
                <button
                  key={c.id}
                  type="button"
                  className={`ai-conv-item${conversationId === c.id ? " active" : ""}`}
                  onClick={() => void openConversation(c.id)}
                >
                  <div className="title">{c.title?.trim() || "Untitled chat"}</div>
                  <div className="meta">{formatDateTime(c.updatedAt)}</div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="ai-main">
          <div className="ai-main-head">
            <strong>
              {mode === "legal_research" ? "Legal research transcript" : "Matter Assist transcript"}
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
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Matter
                </span>
                <select
                  value={matterId}
                  onChange={(e) => {
                    setMatterId(e.target.value);
                    setConversationId(null);
                    setMessages([]);
                    setError(null);
                  }}
                  disabled={loading || matters.length === 0}
                >
                  {matters.length === 0 ? <option value="">No accessible matters</option> : null}
                  {matters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.matterNumber ? `${m.matterNumber} · ` : ""}
                      {m.title}
                    </option>
                  ))}
                </select>
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
            </>
          ) : null}

          <div className="ai-transcript" ref={transcriptRef}>
            {connBanner ? (
              <div
                className={`ai-banner ${connBanner.tone === "danger" ? "danger" : "warn"}`}
                role="status"
              >
                {connBanner.text}
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
            {mode === "legal_research" && kbEmpty ? (
              <div className="ai-banner warn" role="status">
                The Zimbabwe knowledge pack is empty. Re-ingest under Settings → Knowledge pack.
              </div>
            ) : null}
            {mode === "legal_research" && embeddingsMissing && !keyMissing ? (
              <div className="ai-banner warn" role="status">
                Embeddings are not ready. Use Settings → Knowledge pack after the API key is set.
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
                    ? "Ask Zimbabwe law, grounded in the pack"
                    : "Ask about this matter file"}
                </h2>
                <p>
                  {mode === "legal_research"
                    ? "Questions retrieve from the LexZim starter knowledge base. Authorities are never invented."
                    : "Examples: summarise this matter; what procedures are pending; what was the last settlement note? Read-only; no other matters."}
                </p>
              </div>
            ) : null}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`ai-bubble ${m.role === "user" ? "user" : "assistant"}`}
              >
                <div className="ai-bubble-head">
                  <strong>{m.role === "user" ? "You" : "LexZim AI"}</strong>
                  {m.role === "assistant" && m.confidence ? (
                    <Badge
                      tone={
                        m.notFound
                          ? "pending"
                          : m.confidence === "high"
                            ? "open"
                            : "pending"
                      }
                    >
                      {m.notFound ? "not found" : m.confidence}
                    </Badge>
                  ) : null}
                </div>
                <div className="ai-bubble-body">{m.content}</div>
                {m.citations && m.citations.length > 0 ? (
                  <div className="ai-citations">
                    <div className="label">Citations</div>
                    <ul>
                      {m.citations.map((c, i) => (
                        <li key={`${m.id}-c-${i}`}>
                          <strong>{c.citationLabel}</strong>
                          {c.verified === false ? (
                            <Badge tone="pending" style={{ marginLeft: "0.35rem" }}>
                              UNVERIFIED
                            </Badge>
                          ) : null}
                          {c.excerpt ? `: ${c.excerpt}` : null}
                          {c.sourceUrl ? (
                            <>
                              {" "}
                              <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                                open
                              </a>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}

            {loading ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                {mode === "matter_assist"
                  ? "Reading matter facts and drafting an answer…"
                  : "Retrieving context and drafting an answer…"}
              </p>
            ) : null}

            {error ? (
              <p className="ai-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <form className="ai-composer" onSubmit={(e) => void onAsk(e)}>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                sendBlocked
                  ? "AI send is disabled until connectivity is restored…"
                  : mode === "matter_assist"
                    ? "Ask about this matter (summary, procedures, notes)…"
                    : "Ask a Zimbabwe legal research question…"
              }
              rows={2}
              disabled={
                loading ||
                sendBlocked ||
                (mode === "matter_assist" && !matterId)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button
              type="submit"
              variant="gold"
              disabled={
                loading ||
                sendBlocked ||
                !question.trim() ||
                (mode === "matter_assist" && !matterId)
              }
              title={sendBlocked ? sendBlockedReason ?? "AI send disabled" : undefined}
            >
              {loading ? "Thinking…" : sendBlocked ? "Unavailable" : "Ask"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
