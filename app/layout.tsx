import type { Metadata } from "next";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";

export const metadata: Metadata = {
  metadataBase: new URL("https://boxsofa.eu"),
  title: {
    default: "BoxSofa | Compressed Sofas for European Homes",
    template: "%s | BoxSofa"
  },
  description:
    "BoxSofa sells compressed sofas for European apartments, rental homes, old buildings, elevators, staircases, and compact living spaces. Free basic delivery and estimated cross-border delivery in 23-30 days.",
  applicationName: "BoxSofa",
  keywords: ["BoxSofa", "compressed sofa", "European sofa", "modular sofa", "apartment sofa", "sofa in a box"],
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "BoxSofa | Compressed Sofas for European Homes",
    description:
      "Compressed sofas built for European apartments, rental homes, elevators, staircases, and compact living spaces.",
    url: "https://boxsofa.eu",
    siteName: "BoxSofa",
    locale: "en_GB",
    type: "website"
  },
  verification: {
    google: "ReHrUQ9HqM1xxiYbP5XKARBVSdAjkZzbq8V-4haDqGI",
    other: {
      "p:domain_verify": "bf28becfb76e46c0a4be311b08876905"
    }
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
