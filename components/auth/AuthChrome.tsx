"use client";

import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { DidYouKnow } from "@/components/auth/DidYouKnow";
import { LoginSplash } from "@/components/auth/LoginSplash";
import { Icon } from "@/components/ui/Icon";
import { AUTH_TAGLINE } from "@/lib/auth/did-you-know";
import { PLATFORM_PRODUCT_NAME } from "@/lib/firm/branding";

type AuthVisualPanelProps = {
  variant?: "login" | "setup";
};

export function AuthVisualPanel({ variant = "login" }: AuthVisualPanelProps) {
  return (
    <div className="login-visual">
      <div className="login-brand">
        <BrandMark initials="LZ" size="lg" />
        <h1>
          {PLATFORM_PRODUCT_NAME} <span>Legal Practice</span>
        </h1>
        <p className="login-tagline">{AUTH_TAGLINE}</p>
        <DidYouKnow />
      </div>
      <div className="login-pillars">
        <div className="login-pillar">
          <Icon name="shield" />
          <div>
            <strong>Encrypted cloud hosting</strong>
            <span>Firm data isolated by tenant with role-aware access control</span>
          </div>
        </div>
        <div className="login-pillar">
          <Icon name="briefcase" />
          <div>
            <strong>Matter-centric practice</strong>
            <span>Clients, matters, documents, deadlines, billing and trust</span>
          </div>
        </div>
        <div className="login-pillar">
          <Icon name="robot" />
          <div>
            <strong>Zimbabwe-grounded AI</strong>
            <span>RAG research with citations — lawyer in the loop (Phase 2)</span>
          </div>
        </div>
      </div>
      {variant === "setup" && (
        <p style={{ position: "relative", zIndex: 1, fontSize: "1.05rem", color: "var(--text-3)" }}>
          First-run setup creates your firm as tenant #1 on this LexZim instance.
        </p>
      )}
    </div>
  );
}

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <section id="login-screen" aria-label="Authentication">
      <LoginSplash />
      {children}
    </section>
  );
}

export function AuthFormPanel({ children }: { children: ReactNode }) {
  return (
    <div className="login-panel">
      <div className="login-card">{children}</div>
    </div>
  );
}

export function AuthMobileBrand() {
  return (
    <div className="login-mobile-brand">
      <BrandMark initials="LZ" size="sm" />
      <strong>{PLATFORM_PRODUCT_NAME}</strong>
      <span>{AUTH_TAGLINE}</span>
    </div>
  );
}
