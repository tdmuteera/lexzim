"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AboutPanel } from "@/components/settings/AboutPanel";
import { AiSettingsPanel } from "@/components/settings/AiSettingsPanel";
import { BackupExportPanel } from "@/components/settings/BackupExportPanel";
import { DeadlineTemplatesPanel } from "@/components/settings/DeadlineTemplatesPanel";
import { FirmMemoryPanel } from "@/components/settings/FirmMemoryPanel";
import { FirmProfilePanel } from "@/components/settings/FirmProfilePanel";
import { KnowledgePackPanel } from "@/components/settings/KnowledgePackPanel";
import { LicencePanel } from "@/components/settings/LicencePanel";
import { RemindersSettingsPanel } from "@/components/settings/RemindersSettingsPanel";
import { RetrievalDiagnosticPanel } from "@/components/settings/RetrievalDiagnosticPanel";

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
  | "backup";

const SECTIONS: Section[] = [
  "about",
  "firm",
  "licence",
  "ai",
  "knowledge",
  "retrieval",
  "firm-memory",
  "deadlines",
  "reminders",
  "backup",
];

function parseSection(raw: string | null): Section {
  if (raw && (SECTIONS as string[]).includes(raw)) return raw as Section;
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

  return (
    <div className="view">
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0, fontSize: "1.15rem" }}>Settings</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Firm profile, licence, AI, knowledge, backup, and preferences
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="panel">
          <div className="panel-body settings-nav">
            <button
              type="button"
              className={section === "about" ? "active" : undefined}
              onClick={() => setSection("about")}
            >
              About
            </button>
            <button
              type="button"
              className={section === "firm" ? "active" : undefined}
              onClick={() => setSection("firm")}
            >
              Firm profile
            </button>
            <button
              type="button"
              className={section === "licence" ? "active" : undefined}
              onClick={() => setSection("licence")}
            >
              Licence
            </button>
            <button
              type="button"
              className={section === "ai" ? "active" : undefined}
              onClick={() => setSection("ai")}
            >
              AI
            </button>
            <button
              type="button"
              className={section === "knowledge" ? "active" : undefined}
              onClick={() => setSection("knowledge")}
            >
              Knowledge pack
            </button>
            <button
              type="button"
              className={section === "retrieval" ? "active" : undefined}
              onClick={() => setSection("retrieval")}
            >
              RAG diagnostic
            </button>
            <button
              type="button"
              className={section === "firm-memory" ? "active" : undefined}
              onClick={() => setSection("firm-memory")}
            >
              Firm memory
            </button>
            <button
              type="button"
              className={section === "deadlines" ? "active" : undefined}
              onClick={() => setSection("deadlines")}
            >
              Deadline templates
            </button>
            <button
              type="button"
              className={section === "reminders" ? "active" : undefined}
              onClick={() => setSection("reminders")}
            >
              Reminders
            </button>
            <button
              type="button"
              className={section === "backup" ? "active" : undefined}
              onClick={() => setSection("backup")}
            >
              Backup &amp; Export
            </button>
          </div>
        </div>

        <div className="panel">
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
          ) : (
            <BackupExportPanel />
          )}
        </div>
      </div>
    </div>
  );
}
