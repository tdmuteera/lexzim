# AI assistant guide

LexZim’s AI is built for **Zimbabwe-grounded** help: knowledge pack material plus optional firm memory and matter context. It needs internet access to call the model provider.

## Before you rely on it

- AI output is **assistance**, not legal advice and not a filed document.
- Always verify against the Constitution, statutes, rules, cases, or your file.
- LexZim does **not** guarantee correctness. There is no zero-hallucination promise.
- Do not paste secrets (passwords, API keys, full ID numbers) into prompts unless necessary.

## Where to find it

- Sidebar **AI Assistant** for research-style questions
- Matter-level assist and drafting helpers when your firm enables matter context

## Firm configuration (admin)

**Settings → AI**:

1. Choose default provider (Gemini, Claude, or OpenAI) and model.
2. Confirm a key is available (firm BYO encrypted key, or managed server key).
3. **Trusted web lookup** is ON by default for richer Zimbabwe links (allowlisted sites only; results labelled [UNVERIFIED]). A Managing Partner may turn it off under Settings → AI.
4. Set a soft monthly budget if you want cost control. When the budget is hit, new LLM calls soft-block until the next period or an admin raises the limit.
5. Matter context can be turned off firm-wide.

Firm edition may offer a licensed **AI proxy** mode. See your admin or LexZim ops if that applies.

## How to ask good questions

- Name the jurisdiction (Zimbabwe) and the area of law.
- Ask for issues, elements, or checklist style answers when useful.
- Prefer questions that can be grounded in statutes or practice notes.
- For matter assist, keep the question tied to the open file.

If the assistant says it **cannot find** supporting material, or shows a weak-grounding warning, treat that as a signal to research manually. Do not invent citations.

## Pipeline you should expect

Legal turns follow: classify → retrieve (local pack, optional allowlisted web) → generate → **verify** claims against sources → validate citations → final answer. Prefer answers that passed verify; if grounding is weak, research yourself. Greetings and small talk skip retrieval/verify and do not invent sources.

**Sources:** citation links aim for Act-specific search or document URLs on ZimLII/Veritas (not bare publisher homepages). In chat, Sources start **collapsed** behind **Show sources** / **Hide sources**. A search link opens the publisher search page; confirm the Act/section text there. If Sources still open only a homepage, re-ingest the knowledge pack under Settings → Knowledge pack (or `POST /api/ai/knowledge` with `mode: "all"`).

**Edit a message:** on your bubbles, use **Edit**, change the text, then **Save & regenerate**. Later replies in that thread are removed and a new answer is generated (no duplicate user message).

**Dictate:** use **Mic** beside the composer. Recording stops when you click again; the transcript is pasted into the box (it does not auto-send). Needs an OpenAI API key (firm BYO or server `OPENAI_API_KEY`).

Drafted Word downloads use LexZim house style by default (Trebuchet MS, 12pt, 1.5 line spacing, justified, plain black) unless you ask for another style.

## Safety behaviour you should expect

- Assistive disclaimer on legal turns; lawyer must verify primary sources.
- Web lookup default is **on** for richer Zimbabwe links; MP may turn it off. When on, allowlisted only and labelled [UNVERIFIED].
- Soft budget may pause AI without deleting your matters.
- Usage is audited for the firm.

## When AI is unavailable

- Missing API key or provider outage
- Soft budget exceeded
- Licence or edition without AI features
- Matter context disabled for the firm

Check **Settings → AI** and **FAQ.md**, then contact your Managing Partner or LexZim ops.
