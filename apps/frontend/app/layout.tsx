import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocFlow AI — Automated Repository Documentation",
  description:
    "The Vercel for Documentation. DocFlow AI automatically keeps your READMEs and technical docs up to date whenever you push code — powered by parser-first AI, zero cost.",
  keywords: ["documentation", "readme", "AI", "automation", "github", "open source"],
  authors: [{ name: "DocFlow AI" }],
  openGraph: {
    type: "website",
    title: "DocFlow AI",
    description: "Documentation that writes itself. Automatically.",
    siteName: "DocFlow AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocFlow AI",
    description: "Documentation that writes itself. Automatically.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="grid-bg">
        {children}
      </body>
    </html>
  );
}
