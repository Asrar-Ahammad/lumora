import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { CryptoProvider } from "@/components/crypto-provider";
import { UploadProvider } from "@/components/upload-provider";
import { BackgroundUploadsWidget } from "@/components/background-uploads-widget";
import { RecoveryCodeModal } from "@/components/recovery-code-modal";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lumora - Secure E2EE Cloud Drive",
  description: "Secure, E2E encrypted cloud storage drive with smart AI search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${inter.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
          suppressHydrationWarning
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <CryptoProvider>
              <UploadProvider>
                <TooltipProvider>
                  {children}
                  <RecoveryCodeModal />
                  <BackgroundUploadsWidget />
                  <Toaster />
                </TooltipProvider>
              </UploadProvider>
            </CryptoProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
