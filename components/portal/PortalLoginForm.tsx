"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type PortalUser = {
  id: string;
  email: string;
  fullName: string;
  firm: { id: string; name: string; slug: string };
  client: { id: string; displayName: string };
};

export function PortalLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firmSlug, setFirmSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [magicUrl, setMagicUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenFromUrl) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/portal/auth", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenFromUrl }),
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: { user: PortalUser };
          error?: { message: string };
        };
        if (!res.ok || !body.ok) {
          if (!cancelled) {
            setError(body.error?.message ?? "Sign-in link failed.");
          }
          return;
        }
        if (!cancelled) router.replace("/portal/home");
      } catch {
        if (!cancelled) setError("Sign-in link failed.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenFromUrl, router]);

  async function onPasswordLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    setMagicUrl(null);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firmSlug: firmSlug.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Sign-in failed.");
        return;
      }
      router.push("/portal/home");
    } catch {
      setError("Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onMagicRequest() {
    setBusy(true);
    setError(null);
    setInfo(null);
    setMagicUrl(null);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          magicLink: true,
          firmSlug: firmSlug.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { magicLinkUrl?: string | null; note?: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not request link.");
        return;
      }
      setInfo(body.data?.note ?? "If an account exists, a link was created.");
      if (body.data?.magicLinkUrl) setMagicUrl(body.data.magicLinkUrl);
    } catch {
      setError("Could not request link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="portal-card" style={{ maxWidth: "24rem" }}>
      <h1>Client sign in</h1>
      <p className="muted">
        Separate from firm staff login. Sessions last 8 hours. Use the password your firm set, or a
        magic link.
      </p>

      {error ? (
        <p style={{ color: "var(--danger, #b42318)", margin: 0 }}>{error}</p>
      ) : null}
      {info ? <p className="muted" style={{ margin: 0 }}>{info}</p> : null}
      {magicUrl ? (
        <p style={{ margin: 0, fontSize: "0.85rem", wordBreak: "break-all" }}>
          Dev magic link: <a href={magicUrl}>{magicUrl}</a>
        </p>
      ) : null}

      <form className="portal-form" onSubmit={onPasswordLogin}>
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Firm slug (optional)
          <input
            type="text"
            name="firmSlug"
            placeholder="t-pfigu-attorneys"
            value={firmSlug}
            onChange={(e) => setFirmSlug(e.target.value)}
            disabled={busy}
          />
        </label>
        <button type="submit" className="portal-btn" disabled={busy}>
          {busy ? "Please wait…" : "Sign in with password"}
        </button>
      </form>

      <button
        type="button"
        className="portal-btn"
        style={{ background: "transparent", color: "#1e3a5f" }}
        disabled={busy || !email.trim()}
        onClick={() => void onMagicRequest()}
      >
        Email me a magic link
      </button>

      <p>
        <Link href="/portal">Back to portal home</Link>
        {" · "}
        <Link href="/login">Firm staff</Link>
      </p>
    </section>
  );
}
