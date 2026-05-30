import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ex3cuusion",
  description: "AI-assisted execution engine"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
