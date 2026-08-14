import Link from "next/link";

export function DbUnavailableView(props?: { detail?: string; retryHref?: string }) {
  const retryHref = props?.retryHref ?? "/?db_retry=1";
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "var(--bg-0, #f6f3ee)",
        color: "var(--text, #1a160e)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "var(--bg-2, #fff)",
          border: "1px solid var(--border, #e4ddd0)",
          borderRadius: 12,
          padding: "1.5rem 1.75rem",
          boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ fontSize: "1.35rem", margin: "0 0 0.75rem" }}>Database unreachable</h1>
        <p style={{ margin: "0 0 1rem", lineHeight: 1.5, color: "#5c5346" }}>
          LexZim cannot open a Postgres connection to Supabase (pooler timeout). The project may be
          healthy in the dashboard while this network blocks or resets TLS on ports 6543 / 5432.
        </p>
        {props?.detail ? (
          <p
            style={{
              margin: "0 0 1rem",
              fontSize: "0.8rem",
              fontFamily: "Consolas, monospace",
              wordBreak: "break-word",
              color: "#8a3b2b",
            }}
          >
            {props.detail}
          </p>
        ) : null}
        <ol style={{ margin: "0 0 1.25rem", paddingLeft: "1.2rem", lineHeight: 1.55, color: "#5c5346" }}>
          <li>Confirm the project is Healthy in Supabase.</li>
          <li>
            Open <strong>Connect</strong> and re-copy the Transaction pooler URI into{" "}
            <code>DATABASE_URL</code> (Session URI into <code>DIRECT_URL</code>).
          </li>
          <li>Try a VPN or phone hotspot if TLS to the pooler is reset.</li>
          <li>
            Until the DB is reachable again, the app fails fast (about 5s once, then instant) so pages
            do not hang for minutes. The Next.js “rendering” indicator appears while a request is still
            waiting on that timeout.
          </li>
        </ol>
        <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#5c5346" }}>
          Details: <code>docs/HOSTING.md</code> (Database connectivity).
        </p>
        <Link
          href={retryHref}
          style={{
            display: "inline-block",
            padding: "0.55rem 0.9rem",
            borderRadius: 8,
            background: "#1a160e",
            color: "#f6f3ee",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          Retry
        </Link>
      </div>
    </main>
  );
}
