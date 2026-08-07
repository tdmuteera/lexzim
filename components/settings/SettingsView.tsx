"use client";

import { useState } from "react";
import { AiSettingsPanel } from "@/components/settings/AiSettingsPanel";
import { BackupExportPanel } from "@/components/settings/BackupExportPanel";
import { DeadlineTemplatesPanel } from "@/components/settings/DeadlineTemplatesPanel";
import { FirmMemoryPanel } from "@/components/settings/FirmMemoryPanel";
import { KnowledgePackPanel } from "@/components/settings/KnowledgePackPanel";
import { RetrievalDiagnosticPanel } from "@/components/settings/RetrievalDiagnosticPanel";

type Section =
  | "ai"
  | "knowledge"
  | "retrieval"
  | "firm-memory"
  | "deadlines"
  | "backup";

export function SettingsView() {
  const [section, setSection] = useState<Section>("firm-memory");

  return (
    <div className="view">
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0, fontSize: "1.15rem" }}>Settings</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Firm backup, export, AI, knowledge, firm memory, deadlines, and retrieval
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="panel">
          <div className="panel-body settings-nav">
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
              className={section === "backup" ? "active" : undefined}
              onClick={() => setSection("backup")}
            >
              Backup &amp; Export
            </button>
          </div>
        </div>

        <div className="panel">
          {section === "ai" ? (
            <AiSettingsPanel />
          ) : section === "knowledge" ? (
            <KnowledgePackPanel />
          ) : section === "retrieval" ? (
            <RetrievalDiagnosticPanel />
          ) : section === "firm-memory" ? (
            <FirmMemoryPanel />
          ) : section === "deadlines" ? (
            <DeadlineTemplatesPanel />
          ) : (
            <BackupExportPanel />
          )}
        </div>
      </div>
    </div>
  );
}
