import type { Metadata } from "next";
import "./data-center.css";

export const metadata: Metadata = {
  title: "数据中心",
  robots: { index: false, follow: false }
};

export default function DataCenterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
