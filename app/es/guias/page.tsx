import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";
import { spanishGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Guías para Comprar Sofás Comprimidos",
  description:
    "Guías prácticas de BoxSofa para elegir sofás comprimidos, sofás en caja, pisos pequeños, escaleras estrechas y viviendas de alquiler en España.",
  alternates: {
    canonical: "/es/guias"
  },
  openGraph: {
    title: "Guías para Comprar Sofás Comprimidos | BoxSofa",
    description:
      "Consejos para elegir un sofá comprimido para pisos pequeños, escaleras estrechas, entrega en caja y alquileres en España.",
    url: "/es/guias",
    type: "website"
  }
};

export default function SpanishGuidesIndexPage() {
  return (
    <>
      <SiteHeader />
      <main className="guide-page">
        <section className="guide-hero">
          <p className="eyebrow">Guías BoxSofa</p>
          <h1>Elige el sofá comprimido adecuado antes de comprar.</h1>
          <p>
            Consejos prácticos para pisos pequeños, escaleras estrechas, ascensores compactos, sofás en caja y viviendas
            de alquiler en España.
          </p>
          <div className="guide-action-row">
            <Link className="button primary" href="/category/all">
              Ver sofás comprimidos
            </Link>
            <Link className="button" href="/guides">
              English guides
            </Link>
          </div>
        </section>

        <section className="guide-content guide-index-grid" aria-label="Guías para comprar sofás comprimidos">
          {spanishGuides.map((guide) => (
            <Link className="guide-card guide-link-card" href={`/es/guias/${guide.slug}`} key={guide.slug}>
              <span className="eyebrow">Guía</span>
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
