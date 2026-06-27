"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { WarningCircle } from "@phosphor-icons/react";
import styles from "./FilePreview.module.css";

interface FilePreviewProps {
  uri: string;
  fileType?: string;
  fileName?: string;
  className?: string;
  height?: string | number; // default "600px"
}

// Inferred supported fileType values: "docx" | "xlsx" | "pptx" | "pdf" | "csv" | "txt" | "png" | "jpg"
const SUPPORTED_TYPES = new Set(["docx", "xlsx", "pptx", "pdf", "csv", "txt", "png", "jpg", "jpeg", "doc", "xls", "ppt"]);

function inferFileType(uri: string, fileName?: string): string | undefined {
  const nameToParse = fileName || uri;
  const match = nameToParse.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
  if (match) {
    const ext = match[1].toLowerCase();
    if (ext === "jpeg") return "jpg";
    if (SUPPORTED_TYPES.has(ext)) {
      return ext;
    }
  }
  return undefined;
}

// Skeleton loading loader shown while components initialize dynamically
function SkeletonLoader() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonBody} />
    </div>
  );
}

// Error Boundary wrapper to gracefully catch rendering exceptions
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught file preview render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorContainer}>
          <WarningCircle size={32} weight="fill" className="text-destructive" />
          <h3 className={styles.errorTitle}>Unable to preview this file.</h3>
          <p className={styles.errorDescription}>
            Unable to preview this file. Download it to view locally.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Client-side dynamic loading for Excel spreadsheet renderer
const XlsxPreview = dynamic(
  () => import("./renderers/XlsxPreview"),
  {
    ssr: false,
    loading: () => <SkeletonLoader />,
  }
);

// Client-side dynamic loading for whitelisted react-doc-viewer (no MSDocRenderer to prevent Microsoft Login redirect)
const DocViewerClient = dynamic(
  () =>
    import("react-doc-viewer").then((mod) => {
      const Viewer = mod.default;
      
      // Whitelist local browser-only renderers
      const customRenderers = [
        mod.PDFRenderer,
        mod.PNGRenderer,
        mod.JPGRenderer,
        mod.TXTRenderer,
      ];

      return function DocViewerWrapper({ docs }: { docs: any[] }) {
        return (
          <Viewer
            documents={docs}
            pluginRenderers={customRenderers}
            style={{ width: "100%", height: "100%" }}
          />
        );
      };
    }),
  {
    ssr: false,
    loading: () => <SkeletonLoader />,
  }
);

export function FilePreview({
  uri,
  fileType,
  fileName,
  className = "",
  height = "600px",
}: FilePreviewProps) {
  // Unmount blob URL revoker to prevent browser memory leaks
  React.useEffect(() => {
    return () => {
      if (uri && uri.startsWith("blob:")) {
        URL.revokeObjectURL(uri);
      }
    };
  }, [uri]);

  const ext = fileType || inferFileType(uri, fileName);

  const heightStyle = typeof height === "number" ? `${height}px` : height;

  const renderContent = () => {
    // 1. DOCX and PPTX rendering -> show download message
    if (
      ext === "docx" ||
      ext === "doc" ||
      ext === "pptx" ||
      ext === "ppt"
    ) {
      return (
        <div className={styles.errorContainer}>
          <WarningCircle size={32} weight="fill" className="text-amber-500" />
          <h3 className={styles.errorTitle}>Preview not available inline.</h3>
          <p className={styles.errorDescription}>
            Please download the file to view it locally.
          </p>
        </div>
      );
    }

    // 2. Client-side XLSX rendering via SheetJS
    if (ext === "xlsx" || ext === "xls") {
      return <XlsxPreview uri={uri} />;
    }

    // 3. Other files (pdf, txt, csv, images) via whitelisted react-doc-viewer
    const documents = [
      {
        uri,
        fileType: ext,
        fileName,
      },
    ];
    return <DocViewerClient docs={documents} />;
  };

  return (
    <div
      className={`${styles.wrapper} ${className}`}
      style={{ height: heightStyle }}
    >
      <ErrorBoundary>
        {renderContent()}
      </ErrorBoundary>
    </div>
  );
}
