import type { Metadata } from "next";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";

export const metadata: Metadata = {
  metadataBase: new URL("https://boxsofa.eu"),
  title: {
    default: "BoxSofa Europe | Compressed Sofas for European Homes",
    template: "%s | BoxSofa Europe"
  },
  description:
    "BoxSofa sells compressed sofas for European apartments, rental homes, old buildings, elevators, staircases, and compact living spaces. Free basic delivery and estimated cross-border delivery in 23-30 days.",
  applicationName: "BoxSofa Europe",
  keywords: ["BoxSofa", "BoxSofa Europe", "boxsofa.eu", "compressed sofa", "European sofa", "modular sofa", "apartment sofa", "sofa in a box"],
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "BoxSofa Europe | Compressed Sofas for European Homes",
    description:
      "Compressed sofas built for European apartments, rental homes, elevators, staircases, and compact living spaces.",
    url: "https://boxsofa.eu",
    siteName: "BoxSofa Europe",
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

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://boxsofa.eu/#organization",
  name: "BoxSofa Europe",
  alternateName: ["BoxSofa", "boxsofa.eu"],
  url: "https://boxsofa.eu",
  email: "info@boxsofa.eu",
  sameAs: [
    "https://www.facebook.com/profile.php?id=61591789692090",
    "https://www.instagram.com/boxsofaeurope/",
    "https://www.tiktok.com/@boxsofaeurope",
    "https://www.youtube.com/@boxsofaeurope",
    "https://www.pinterest.com/of1985839/"
  ]
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://boxsofa.eu/#website",
  url: "https://boxsofa.eu",
  name: "BoxSofa Europe",
  alternateName: "BoxSofa",
  publisher: {
    "@id": "https://boxsofa.eu/#organization"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
