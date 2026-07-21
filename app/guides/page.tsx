import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { guides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Compressed Sofa Buying Guides",
  description:
    "Practical BoxSofa buying guides for compressed sofas, small apartments, narrow stairs, sofa-in-a-box delivery and rental homes in Spain and Europe.",
  alternates: {
    canonical: "/guides"
  },
  openGraph: {
    title: "Compressed Sofa Buying Guides | BoxSofa",
    description:
      "Choose a compressed sofa for small apartments, narrow stairs, rental homes and sofa-in-a-box delivery in Spain and Europe.",
    url: "/guides",
    type: "website"
  }
};

export default function GuidesIndexPage() {
  return (
    <>
      <SiteHeader />
      <main className="guide-page">
        <section className="guide-hero">
          <p className="eyebrow">BoxSofa buying guides</p>
          <h1>Choose the right compressed sofa before you order.</h1>
          <p>
            Practical guides for small apartments, narrow stairs, compact lifts, sofa-in-a-box delivery and flexible
            rental homes in Spain and Europe.
          </p>
          <Link className="button primary" href="/category/all">
            Shop compressed sofas
          </Link>
        </section>

        <section className="guide-content guide-index-grid" aria-label="Compressed sofa buying guides">
          {guides.map((guide) => (
            <Link className="guide-card guide-link-card" href={`/guides/${guide.slug}`} key={guide.slug}>
              <span className="eyebrow">Guide</span>
              <h2>{guide.title}</h2>
              <p>{guide.description}</p>
            </Link>
          ))}
        </section>
      </main>
      <SiteFooter />
      <SupportButton />
    </>
  );
}
