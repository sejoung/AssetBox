import { exportPath } from "../lib/exportPaths";
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AssetInfo, ValidationResult } from "../types/asset";
import { generateHTMLReport } from "../lib/reportGenerator";
import { OVERLAY_BG, OVERLAY_BORDER, OVERLAY_BACKDROP } from "../lib/overlayStyle";
import * as log from "../lib/logger";

interface ReportButtonProps {
  asset: AssetInfo | null;
  validation: ValidationResult | null;
}

export function ReportButton({ asset, validation }: ReportButtonProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  const handleGenerate = useCallback(async () => {
    if (!asset || !validation) return;
    setStatus("saving");
    try {
      const html = generateHTMLReport(asset, validation);
      const reportPath = exportPath(asset.filePath, "report");
      await invoke("save_text_file", { content: html, outputPath: reportPath });
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      log.error("Report generation failed:", err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [asset, validation]);

  const config = {
    idle: { label: "Report", bg: OVERLAY_BG, borderStyle: OVERLAY_BORDER },
    saving: { label: "Saving…", bg: OVERLAY_BG, borderStyle: OVERLAY_BORDER },
    done: { label: "Saved!", bg: "#4ade80", borderStyle: "none" },
    error: { label: "Failed", bg: "#f87171", borderStyle: "none" },
  }[status];

  return (
    <button
      aria-live="polite"
      aria-busy={status === "saving"}
      title="Save an HTML inspection report beside the model"
      onClick={handleGenerate}
      disabled={!asset || !validation || status === "saving"}
      className="ui-button export-button"
      style={{
        backgroundColor: config.bg,
        color: status === "done" || status === "error" ? "#111827" : "var(--text-primary)",
        border: config.borderStyle,
        backdropFilter: OVERLAY_BACKDROP,
      }}
    >
      {status === "idle" && (
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
      )}
      {config.label}
    </button>
  );
}
