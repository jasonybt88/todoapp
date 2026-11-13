"use client";

import { useRef, useState, type ChangeEvent } from "react";

interface ExportImportToolbarProps {
  onImported: () => Promise<void>;
}

type ImportMessage = {
  type: "success" | "error";
  text: string;
};

const LARGE_IMPORT_BYTES = 10 * 1024 * 1024;

function downloadExport(format: "json" | "csv") {
  const link = document.createElement("a");
  link.href = `/api/todos/export?format=${format}`;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function ExportImportToolbar({ onImported }: ExportImportToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [largeImport, setLargeImport] = useState(false);
  const [message, setMessage] = useState<ImportMessage | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setLargeImport(file.size > LARGE_IMPORT_BYTES);
    setMessage(null);
    try {
      const body: unknown = JSON.parse(await file.text());
      const response = await fetch("/api/todos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { imported?: number; error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to import todos");
      }

      await onImported();
      setMessage({
        type: "success",
        text: `Successfully imported ${result.imported ?? 0} todos`,
      });
    } catch (cause) {
      setMessage({
        type: "error",
        text: cause instanceof SyntaxError
          ? "Invalid JSON format"
          : cause instanceof Error
            ? cause.message
            : "Failed to import todos",
      });
    } finally {
      setImporting(false);
      setLargeImport(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="export-import-toolbar" aria-label="Todo backup">
      <button
        className="btn-export-json"
        type="button"
        onClick={() => downloadExport("json")}
      >
        Export JSON
      </button>
      <button
        className="btn-export-csv"
        type="button"
        onClick={() => downloadExport("csv")}
      >
        Export CSV
      </button>
      <button
        className="btn-import"
        type="button"
        disabled={importing}
        onClick={() => fileInputRef.current?.click()}
      >
        {importing ? "Importing..." : "Import"}
      </button>
      <input
        ref={fileInputRef}
        className="import-file-input"
        type="file"
        accept="application/json,.json"
        aria-label="Choose a JSON backup"
        onChange={handleFile}
      />
      {importing && largeImport && (
        <span className="muted" role="status">This large file may take a while.</span>
      )}
      {message && (
        <span
          className={message.type === "success" ? "import-success" : "import-error"}
          role={message.type === "success" ? "status" : "alert"}
        >
          {message.text}
        </span>
      )}
      <span className="export-import-note">
        Import adds new todos without merging. CSV exports are not re-importable.
      </span>
    </div>
  );
}
