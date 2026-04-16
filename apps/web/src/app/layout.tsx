import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "New Sky",
  description: "Your day at a glance",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#7FB3E0" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="New Sky" />
        <link rel="apple-touch-icon" href="/newsky-icon.png" />
      </head>
      <body className="bg-cream text-gray-900 font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}
