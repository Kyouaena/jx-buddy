import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "投资 X Buddy · 研究工作台",
  description: "规划研究、检验证据、保留每一步。个人投资研究 Agent 工作台。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
