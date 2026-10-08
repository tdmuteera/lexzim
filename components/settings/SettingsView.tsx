"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { pageTransitionClass } from "@/lib/motion/page-transitions";
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
import { StaffNotificationEmailsPanel } from "@/components/settings/StaffNotificationEmailsPanel";
import { UserProfilePanel } from "@/components/settings/UserProfilePanel";
import { UserActivityPanel } from "@/components/staff/UserActivityPanel";
import { useAuth } from "@/components/auth/AuthProvider";

type Section =
  | "profile"
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
  | "staff-notifications"
  | "user-activity"
  | "security"
  | "backup";

const NAV: Array<{
  id: Section;
  label: string;
  icon: NavIcon;
  /** Hide unless the viewer has at least one of these permissions. */
  anyOf?: string[];
}> = [
  { id: "profile", label: "Account profile", icon: "user" },
  { id: "about", label: "About", icon: "shield" },
  { id: "firm", label: "Firm profile", icon: "briefcase" },
  { id: "licence", label: "Licence", icon: "lock" },
  { id: "ai", label: "AI", icon: "robot" },
  { id: "knowledge", label: "Knowledge pack", icon: "folder" },
  { id: "retrieval", label: "Source check", icon: "search" },
  { id: "firm-memory", label: "Firm memory", icon: "chart" },
  { id: "deadlines", label: "Deadline templates", icon: "calendar" },
  { id: "reminders", label: "Reminders", icon: "bell" },
  { id: "email", label: "Email", icon: "clipboard" },
  {
    id: "staff-notifications",
    label: "Staff notifications",
    icon: "bell",
    anyOf: ["users.manage"],
  },
  {
    id: "user-activity",
    label: "User activity",
    icon: "chart",
    anyOf: ["users.activity.view", "users.manage"],
  },
  { id: "security", label: "Security", icon: "lock" },
  { id: "backup", label: "Backup & Export", icon: "clipboard" },
];

function parseSection(raw: string | null): Section {
  if (raw && NAV.some((n) => n.id === raw)) return raw as Section;
  return "about";
}

export function SettingsView() {
  const searchParams = useSearchParams();
  const { canAny } = useAuth();
  const [section, setSection] = useState<Section>(() =>
    parseSection(searchParams.get("section")),
  );

  useEffect(() => {
    setSection(parseSection(searchParams.get("section")));
  }, [searchParams]);

  const visibleNav = NAV.filter(
    (item) => !item.anyOf || canAny(item.anyOf),
  );
  const activeLabel = visibleNav.find((n) => n.id === section)?.label ?? "Settings";

  function selectSection(id: Section) {
    setSection(id);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("section", id);
      const next = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, "", next);
    }
  }

  return (
    <div className="view active scrollable settings-view" aria-label="Settings">
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
            {visibleNav.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "active" : undefined}
                onClick={() => selectSection(item.id)}
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
          <div
            key={section}
            className={`panel-body settings-main-body enter-motion ${pageTransitionClass(section)}`}
          >
            {section === "profile" ? (
              <UserProfilePanel />
            ) : section === "about" ? (
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
            ) : section === "staff-notifications" ? (
              <StaffNotificationEmailsPanel />
            ) : section === "user-activity" ? (
              <UserActivityPanel />
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
