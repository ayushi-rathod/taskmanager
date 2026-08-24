import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collaborative Task Manager",
  description: "Minimal task manager bootstrap shell",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
