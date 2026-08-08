import Link from "next/link";
import { USER_DOCS } from "@/lib/help/user-docs";

export function HelpView() {
  return (
    <section className="view active scrollable" aria-label="Help">
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Help</h2>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          Guides for Zimbabwe practitioners. Written for the hosted LexZim web app.
        </p>
      </div>

      <div style={{ display: "grid", gap: "0.75rem", maxWidth: "42rem" }}>
        {USER_DOCS.map((topic) => (
          <article
            key={topic.slug}
            id={topic.slug}
            className="panel"
            style={{ scrollMarginTop: "1rem" }}
          >
            <div className="panel-body" style={{ display: "grid", gap: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>{topic.title}</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                {topic.summary}
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <Link href={`/help/${topic.slug}`}>Read guide</Link>
                <Link href={topic.appHref}>Open in app</Link>
              </div>
            </div>
          </article>
        ))}

        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Safety defaults: the onboarding checklist never blocks the app, and it does not
          auto-enable web lookup or telemetry.
        </p>
      </div>
    </section>
  );
}
