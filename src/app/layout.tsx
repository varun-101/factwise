import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quarantine Care",
  description:
    "Daily rounds, discharge tracking, and treatment-quality monitoring for the quarantine centre.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
