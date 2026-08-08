import Link from "next/link";
import { notFound } from "next/navigation";
import { loadUserDocHtml } from "@/lib/help/load-user-doc";
import { isUserDocSlug } from "@/lib/help/user-docs";

type Props = { slug: string };

export async function HelpDocView({ slug }: Props) {
  if (!isUserDocSlug(slug)) notFound();

  let doc: Awaited<ReturnType<typeof loadUserDocHtml>>;
  try {
    doc = await loadUserDocHtml(slug);
  } catch {
    notFound();
  }

  return (
    <section className="view active scrollable" aria-label={doc.title}>
      <div
        style={{
          marginBottom: "1rem",
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            <Link href="/help">Help</Link>
            {" / "}
            {doc.title}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href={doc.appHref}>Open related screen</Link>
          <Link href="/help">All guides</Link>
        </div>
      </div>

      <article
        className="panel help-doc"
        style={{ maxWidth: "46rem" }}
      >
        <div
          className="panel-body help-prose"
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
      </article>
    </section>
  );
}
