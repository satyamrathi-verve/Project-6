import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AR Manager — Verve",
  description: "Accounts Receivable manager",
  icons: {
    icon: "/verve-icon.png",
    apple: "/verve-icon.png",
  },
};

const themeInitScript = `
  try {
    if (localStorage.getItem("ar_theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
