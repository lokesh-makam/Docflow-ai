import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "DocFlow AI — AI-Powered README Generation",
    template: "%s | DocFlow AI",
  },
  description:
    "Generate professional, accurate GitHub READMEs with AI. Analyze your repository structure and commit documentation directly from the browser.",
  keywords: ["readme", "documentation", "AI", "github", "developer tools", "open source"],
  authors: [{ name: "DocFlow AI" }],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title: "DocFlow AI — AI-Powered README Generation",
    description: "Generate professional GitHub READMEs with AI in seconds.",
    siteName: "DocFlow AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocFlow AI",
    description: "Generate professional GitHub READMEs with AI in seconds.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="grid-bg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
