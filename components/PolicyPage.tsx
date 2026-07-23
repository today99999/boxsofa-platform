import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportButton } from "@/components/SupportButton";

type PolicySection = {
  title: string;
  body: string;
  action?: ReactNode;
};

type PolicyPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: PolicySection[];
};

export function PolicyPage({ eyebrow, title, intro, sections }: PolicyPageProps) {
  return (
    <>
      <SiteHeader />
      <main className="policy-page">
        <section className="policy-hero">
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <span>{intro}</span>
        </section>

        <section className="policy-content" aria-label={title}>
          {sections.map((section) => (
            <article className="policy-card" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
              {section.action ? <div className="policy-card-action">{section.action}</div> : null}
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
      <SupportButton />
    </>
  );
}
