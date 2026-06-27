"use client";

import * as React from "react";
import { FilePreview } from "./index";
import { toBlobUrl, revokeBlobUrl } from "../../lib/filePreview/toBlobUrl";

export function FilePreviewExample() {
  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <h2>File Preview Usage Patterns</h2>

      {/* 
        ========================================================================
        PATTERN 1: Remote URL File Preview
        ========================================================================
        This pattern directly displays a publicly accessible remote file url.
      */}
      <div style={{ border: "1px solid #ccc", padding: "16px", borderRadius: "8px" }}>
        <h3>Remote File Preview</h3>
        <FilePreview 
          uri="https://example.com/file.docx" 
          fileName="report.docx" 
          height="400px" 
        />
      </div>

      {/* 
        ========================================================================
        PATTERN 2: Decrypted E2EE File Preview using local Blob URLs
        ========================================================================
        This pattern takes decrypted binary data (ArrayBuffer), converts it into 
        a local Object Blob URL, passes it inline to `<FilePreview>`, and then 
        cleanups (revokes) the URL on component unmount to prevent memory leaks.

        Example implementation snippet:

        ```tsx
        const [blobUrl, setBlobUrl] = React.useState<string | null>(null);

        React.useEffect(() => {
          // 1. Convert decrypted buffer to temporary local Blob URL
          const decryptedBuffer = getDecryptedFileBuffer(); // ArrayBuffer
          const url = toBlobUrl(decryptedBuffer, "docx");
          setBlobUrl(url);

          // 2. Revoke the Blob URL on unmount to release browser memory
          return () => {
            revokeBlobUrl(url);
          };
        }, []);

        if (!blobUrl) return <div>Decrypting document...</div>;

        return (
          <FilePreview 
            uri={blobUrl} 
            fileType="docx" 
            fileName="secure_report.docx" 
            height="400px" 
          />
        );
        ```
      */}
    </div>
  );
}
