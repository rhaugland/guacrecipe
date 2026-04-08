import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guac",
  description: "Communication switchboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-gray-900 font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}
