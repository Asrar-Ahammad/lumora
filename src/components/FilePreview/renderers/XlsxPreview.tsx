"use client";

import * as React from "react";
import * as XLSX from "xlsx";

interface XlsxPreviewProps {
  uri: string;
}

export default function XlsxPreview({ uri }: XlsxPreviewProps) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    async function loadExcel() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(uri);
        if (!response.ok) throw new Error("Failed to fetch Excel file.");
        
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        
        if (!active) return;

        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        const sheetHtml = XLSX.utils.sheet_to_html(firstSheet, { id: "xlsx-preview-table" });

        if (active) {
          setHtml(sheetHtml);
        }
      } catch (err: any) {
        console.error("XlsxPreview error:", err);
        if (active) {
          setError(err.message || "Failed to render spreadsheet.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadExcel();

    return () => {
      active = false;
    };
  }, [uri]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading spreadsheet...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-destructive">
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full overflow-auto p-4 bg-background text-foreground font-sans prose dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html || "" }}
    />
  );
}
