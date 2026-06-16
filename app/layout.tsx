import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoxSofa | 压缩沙发",
  description: "面向欧洲市场的压缩沙发独立站"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
