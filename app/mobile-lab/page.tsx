import { notFound } from "next/navigation";
import "./mobile-lab.css";

/**
 * Local-only mobile layout lab. Not linked in nav. Production returns 404.
 */
export default function MobileLabPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mobile-lab-shell">
      <header className="mobile-lab-top">
        <strong>LexZim mobile lab</strong>
        <span className="muted">390px fixture · not production</span>
      </header>

      <main className="content mobile-lab-content">
        <section className="view active scrollable" aria-label="Tabs sample">
          <h2>Tab strip scroll</h2>
          <div className="module-tabs" role="tablist">
            {[
              "Overview",
              "Invoices",
              "Payments",
              "Trust",
              "Pro forma",
              "Reports",
              "Settings",
            ].map((t) => (
              <button key={t} type="button" className="tab">
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-view" aria-label="Settings nav sample">
          <div className="settings-nav-panel panel">
            <div className="panel-body">
              <nav className="settings-nav">
                {["Profile", "Security", "Email", "Branding", "Billing", "AI", "Reminders"].map(
                  (t, i) => (
                    <button key={t} type="button" className={i === 0 ? "active" : undefined}>
                      <span>{t}</span>
                    </button>
                  ),
                )}
              </nav>
            </div>
          </div>
        </section>

        <section className="view active ai-chat" aria-label="AI chat sample">
          <div className="ai-chat-toolbar">
            <div>
              <h1>AI Legal Assistant</h1>
              <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                Mobile fixture: composer must stay full-width at the bottom.
              </p>
              <div className="ai-chip-row" style={{ marginTop: "0.55rem" }}>
                <div className="ai-mode-tabs" role="tablist">
                  <button type="button" className="active">
                    Legal Research
                  </button>
                  <button type="button">Matter Assist</button>
                </div>
                <span className="ai-chip">AI ready</span>
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm">
              New chat
            </button>
          </div>

          <div className="ai-layout">
            <aside className="ai-sidebar">
              <div className="ai-sidebar-head">
                <strong>Conversations</strong>
              </div>
              <div className="ai-conv-list">
                {["Stamp duty bands", "Cession vs title", "VAT on commercial"].map((t, i) => (
                  <div key={t} className={`ai-conv-row${i === 0 ? " active" : ""}`}>
                    <button type="button" className={`ai-conv-item${i === 0 ? " active" : ""}`}>
                      <div className="title">{t}</div>
                      <div className="meta">Today</div>
                    </button>
                    <button type="button" className="ai-conv-delete" aria-label="Delete">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </aside>

            <section className="ai-main">
              <div className="ai-main-head">
                <strong>Conversation</strong>
              </div>
              <div className="ai-transcript">
                <div className="ai-bubble user">
                  <div className="ai-bubble-head">
                    <strong>You</strong>
                  </div>
                  <div className="ai-bubble-body">
                    What is progressive stamp duty on a USD 80,000 transfer?
                  </div>
                </div>
                <div className="ai-bubble assistant">
                  <div className="ai-bubble-head">
                    <strong>LexZim</strong>
                  </div>
                  <div className="ai-md">
                    <p className="ai-md-p">
                      Stamp duty uses Finance Act progressive bands. Confirm the current schedule
                      before advising a client.
                    </p>
                  </div>
                </div>
                <p className="ai-thinking muted" role="status">
                  Thinking…
                </p>
              </div>
              <form className="ai-composer">
                <div className="ai-composer-main">
                  <textarea
                    defaultValue=""
                    placeholder="Message LexZim…"
                    rows={2}
                    readOnly
                  />
                </div>
                <div className="ai-composer-actions">
                  <label className="ai-attach-btn">Attach</label>
                  <button type="button" className="ai-mic-btn">
                    Mic
                  </button>
                  <button type="submit" className="btn btn-gold">
                    Thinking…
                  </button>
                </div>
              </form>
            </section>
          </div>
        </section>

        <section aria-label="Table sample">
          <h2>Table swipe</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Client</th>
                  <th>Firm fees</th>
                  <th>Collectibles</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>PF-0001</td>
                  <td>Sample Client</td>
                  <td>$1,200.00</td>
                  <td>$450.00</td>
                  <td>$1,650.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Primary mobile">
        {["Menu", "Home", "Clients", "AI", "More"].map((t, i) => (
          <button
            key={t}
            type="button"
            className={`mobile-bottom-item${i === 3 ? " active" : ""}`}
          >
            <span>{t}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
