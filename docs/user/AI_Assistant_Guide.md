# AI assistant guide

LexZim’s AI is built for **Zimbabwe-grounded** help: knowledge pack material plus optional firm memory and matter context. It needs internet access to call the model provider.

## Before you rely on it

- AI output is **assistance**, not legal advice and not a filed document.
- Always verify against the Constitution, statutes, rules, cases, or your file.
- Do not paste secrets (passwords, API keys, full ID numbers) into prompts unless necessary.

## Where to find it

- Sidebar **AI Assistant** for research-style questions
- Matter-level assist and drafting helpers when your firm enables matter context

## Firm configuration (admin)

**Settings → AI**:

1. Choose default provider (Gemini, Claude, or OpenAI) and model.
2. Confirm a key is available (firm BYO encrypted key, or managed server key).
3. Leave **web lookup off** unless your firm explicitly wants live web fetches.
4. Set a soft monthly budget if you want cost control. When the budget is hit, new LLM calls soft-block until the next period or an admin raises the limit.
5. Matter context can be turned off firm-wide.

Firm edition may offer a licensed **AI proxy** mode. See your admin or LexZim ops if that applies.

## How to ask good questions

- Name the jurisdiction (Zimbabwe) and the area of law.
- Ask for issues, elements, or checklist style answers when useful.
- Prefer questions that can be grounded in statutes or practice notes.
- For matter assist, keep the question tied to the open file.

If the assistant says it **cannot find** supporting material, treat that as a signal to research manually. Do not invent citations.

## Safety behaviour you should expect

- Disclaimer text remains on.
- Web lookup default is **off**.
- Soft budget may pause AI without deleting your matters.
- Usage is audited for the firm.

## When AI is unavailable

- Missing API key or provider outage
- Soft budget exceeded
- Licence or edition without AI features
- Matter context disabled for the firm

Check **Settings → AI** and **FAQ.md**, then contact your Managing Partner or LexZim ops.
