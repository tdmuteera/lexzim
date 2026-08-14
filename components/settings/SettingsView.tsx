"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { NavIcon } from "@/lib/nav";
import { AboutPanel } from "@/components/settings/AboutPanel";
import { AiSettingsPanel } from "@/components/settings/AiSettingsPanel";
import { BackupExportPanel } from "@/components/settings/BackupExportPanel";
import { DeadlineTemplatesPanel } from "@/components/settings/DeadlineTemplatesPanel";
import { EmailSettingsPanel } from "@/components/settings/EmailSettingsPanel";
import { FirmMemoryPanel } from "@/components/settings/FirmMemoryPanel";
import { FirmProfilePanel } from "@/components/settings/FirmProfilePanel";
import { KnowledgePackPanel } from "@/components/settings/KnowledgePackPanel";
import { LicencePanel } from "@/components/settings/LicencePanel";
import { RemindersSettingsPanel } from "@/components/settings/RemindersSettingsPanel";
import { RetrievalDiagnosticPanel } from "@/components/settings/RetrievalDiagnosticPanel";
import { SecurityPanel } from "@/components/settings/SecurityPanel";

type Section =
  | "about"
  | "firm"
  | "licence"
  | "ai"
  | "knowledge"
  | "retrieval"
  | "firm-memory"
  | "deadlines"
  | "reminders"
  | "email"
  | "security"
  | "backup";

const NAV: Array<{ id: Section; label: string; icon: NavIcon }> = [
  { id: "about", label: "About", icon: "shield" },
  { id: "firm", label: "Firm profile", icon: "briefcase" },
  { id: "licence", label: "Licence", icon: "lock" },
  { id: "ai", label: "AI", icon: "robot" },
  { id: "knowledge", label: "Knowledge pack", icon: "folder" },
  { id: "retrieval", label: "RAG diagnostic", icon: "search" },
  { id: "firm-memory", label: "Firm memory", icon: "chart" },
  { id: "deadlines", label: "Deadline templates", icon: "calendar" },
  { id: "reminders", label: "Reminders", icon: "bell" },
  { id: "email", label: "Email", icon: "clipboard" },
  { id: "security", label: "Security", icon: "lock" },
  { id: "backup", label: "Backup & Export", icon: "clipboard" },
];

function parseSection(raw: string | null): Section {
  if (raw && NAV.some((n) => n.id === raw)) return raw as Section;
  return "about";
}

export function SettingsView() {
  const searchParams = useSearchParams();
  const [section, setSection] = useState<Section>(() =>
    parseSection(searchParams.get("section")),
  );

  useEffect(() => {
    setSection(parseSection(searchParams.get("section")));
  }, [searchParams]);

  const activeLabel = NAV.find((n) => n.id === section)?.label ?? "Settings";

  return (
    <div className="view active settings-view" aria-label="Settings">
      <div className="settings-hero">
        <span className="settings-hero-icon">
          <Icon name="gear" />
        </span>
        <div>
          <h1>Settings</h1>
          <p className="muted">
            Firm profile, licence, AI, knowledge, backup, and preferences
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <aside className="panel settings-nav-panel" aria-label="Settings sections">
          <div className="panel-head">
            <h3>Sections</h3>
          </div>
          <nav className="panel-body settings-nav">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "active" : undefined}
                onClick={() => setSection(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="panel settings-main-panel" aria-label={activeLabel}>
          <div className="panel-head">
            <h3>{activeLabel}</h3>
          </div>
          <div className="panel-body settings-main-body">
            {section === "about" ? (
              <AboutPanel />
            ) : section === "firm" ? (
              <FirmProfilePanel />
            ) : section === "licence" ? (
              <LicencePanel />
            ) : section === "ai" ? (
              <AiSettingsPanel />
            ) : section === "knowledge" ? (
              <KnowledgePackPanel />
            ) : section === "retrieval" ? (
              <RetrievalDiagnosticPanel />
            ) : section === "firm-memory" ? (
              <FirmMemoryPanel />
            ) : section === "deadlines" ? (
              <DeadlineTemplatesPanel />
            ) : section === "reminders" ? (
              <RemindersSettingsPanel />
            ) : section === "email" ? (
              <EmailSettingsPanel />
            ) : section === "security" ? (
              <SecurityPanel />
            ) : (
              <BackupExportPanel />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
