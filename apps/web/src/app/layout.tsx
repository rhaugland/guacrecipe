import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guac",
  description: "Communication switchboard",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#4A7C59" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Guac" />
        <link rel="apple-touch-icon" href="/guac-emoji-icon.png" />
      </head>
      <body className="bg-cream text-gray-900 font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}
