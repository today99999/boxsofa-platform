"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useTranslation } from "@/components/useTranslation";

const footerCopy = {
  zh: {
    newsletterTitle: "把欧洲小空间家居灵感发到你的邮箱",
    newsletterText: "订阅 BoxSofa，获取压缩沙发新品、补货、组合灵感和跨境配送更新。",
    emailPlaceholder: "输入邮箱",
    subscribe: "订阅",
    consent: "我已阅读隐私政策，并同意接收 BoxSofa 邮件。",
    thanks: "已记录订阅意向，正式邮件系统上线后启用。",
    about: "关于 BoxSofa",
    aboutText: "BoxSofa 专注欧洲市场的压缩海绵沙发，适合公寓、出租房、窄楼梯、小电梯和需要灵活布置的城市家庭。",
    info: "购物信息",
    contact: "联系方式",
    payments: "付款方式",
    trust: "感谢你的信任",
    shipping: "配送说明",
    returns: "退换与质保",
    privacy: "隐私政策",
    terms: "服务条款",
    faq: "常见问题",
    tracking: "订单查询",
    reviews: "客户评价",
    businessHours: "周一至周五 09:00-18:00 CET",
    whatsapp: "WhatsApp 客服预留",
    noAdvance: "Stripe 安全银行卡支付",
    sellerConfirm: "支付成功后确认订单",
    cardSoon: "西班牙基础配送免费",
    memberDiscount: "会员累计满 EUR 300 后 9 折",
    trustScore: "客户评价 4.8 / 5",
    compressed: "真空压缩包装",
    euDelivery: "跨境物流预估 23-30 天",
    copyright: "© 2026 BoxSofa Europe. 保留所有权利。"
  },
  en: {
    newsletterTitle: "Home refresh ideas for compact European living",
    newsletterText: "Subscribe for new compressed sofa styles, restocks, room ideas and delivery updates.",
    emailPlaceholder: "Enter email",
    subscribe: "Subscribe",
    consent: "I have read the privacy notice and agree to receive BoxSofa emails.",
    thanks: "Subscription interest saved. The mailing system will be connected before launch.",
    about: "About BoxSofa",
    aboutText: "BoxSofa focuses on compressed foam sofas for European apartments, rental homes, narrow stairs, small lifts and flexible city living.",
    info: "Information",
    contact: "Contact",
    payments: "Payment options",
    trust: "Thank you for your trust",
    shipping: "Shipping",
    returns: "Returns and warranty",
    privacy: "Privacy policy",
    terms: "Terms of service",
    faq: "Compressed sofa FAQ",
    tracking: "Order tracking",
    reviews: "Customer reviews",
    businessHours: "Mon-Fri 09:00-18:00 CET",
    whatsapp: "WhatsApp support reserved",
    noAdvance: "Secure card payment with Stripe",
    sellerConfirm: "Order confirmed after payment",
    cardSoon: "Free basic delivery in Spain",
    memberDiscount: "10% member discount after EUR 300 confirmed spend",
    trustScore: "Customer rating 4.8 / 5",
    compressed: "Vacuum-compressed packaging",
    euDelivery: "EU cross-border delivery estimated in 23-30 days",
    copyright: "© 2026 BoxSofa Europe. All rights reserved."
  },
  es: {
    newsletterTitle: "Ideas para renovar hogares compactos en Europa",
    newsletterText: "Suscríbete para recibir nuevos sofás comprimidos, reposiciones, ideas de sala y novedades de entrega.",
    emailPlaceholder: "Introduce el email",
    subscribe: "Suscribirse",
    consent: "He leído el aviso de privacidad y acepto recibir emails de BoxSofa.",
    thanks: "Interés de suscripción guardado. El sistema de email se conectará antes del lanzamiento.",
    about: "Sobre BoxSofa",
    aboutText: "BoxSofa se centra en sofás de espuma comprimida para apartamentos europeos, viviendas de alquiler, escaleras estrechas, ascensores pequeños y hogares urbanos flexibles.",
    info: "Información",
    contact: "Contacto",
    payments: "Formas de pago",
    trust: "Gracias por tu confianza",
    shipping: "Entrega",
    returns: "Devoluciones y garantía",
    privacy: "Política de privacidad",
    terms: "Condiciones",
    faq: "FAQ de sofás comprimidos",
    tracking: "Seguimiento de pedidos",
    reviews: "Reseñas de clientes",
    businessHours: "L-V 09:00-18:00 CET",
    whatsapp: "Soporte por WhatsApp reservado",
    noAdvance: "Pago seguro con tarjeta mediante Stripe",
    sellerConfirm: "Pedido confirmado tras el pago",
    cardSoon: "Entrega básica gratuita en España",
    memberDiscount: "10% de descuento al superar EUR 300 confirmados",
    trustScore: "Valoración de clientes 4.8 / 5",
    compressed: "Embalaje comprimido al vacío",
    euDelivery: "Entrega internacional en Europa estimada en 23-30 días",
    copyright: "© 2026 BoxSofa Europe. Todos los derechos reservados."
  },
  fr: {
    newsletterTitle: "Des idées pour aménager les petits espaces européens",
    newsletterText: "Abonnez-vous pour recevoir les nouveautés, réassorts, idées d'aménagement et mises à jour de livraison.",
    emailPlaceholder: "Saisir l'e-mail",
    subscribe: "S'abonner",
    consent: "J'ai lu l'avis de confidentialité et j'accepte de recevoir les e-mails BoxSofa.",
    thanks: "Intérêt d'abonnement enregistré. Le système e-mail sera connecté avant le lancement.",
    about: "À propos de BoxSofa",
    aboutText: "BoxSofa propose des canapés en mousse compressée pour appartements européens, locations, escaliers étroits, petits ascenseurs et espaces urbains flexibles.",
    info: "Informations",
    contact: "Contact",
    payments: "Moyens de paiement",
    trust: "Merci pour votre confiance",
    shipping: "Livraison",
    returns: "Retours et garantie",
    privacy: "Politique de confidentialité",
    terms: "Conditions",
    faq: "FAQ canapé compressé",
    tracking: "Suivi de commande",
    reviews: "Avis clients",
    businessHours: "Lun-ven 09:00-18:00 CET",
    whatsapp: "Support WhatsApp réservé",
    noAdvance: "Paiement sécurisé par carte via Stripe",
    sellerConfirm: "Commande confirmée après paiement",
    cardSoon: "Livraison de base gratuite en Espagne",
    memberDiscount: "10% de remise après EUR 300 confirmés",
    trustScore: "Note clients 4.8 / 5",
    compressed: "Emballage compressé sous vide",
    euDelivery: "Livraison transfrontalière Europe estimée en 23-30 jours",
    copyright: "© 2026 BoxSofa Europe. Tous droits réservés."
  },
  de: {
    newsletterTitle: "Wohnideen für kompakte europäische Räume",
    newsletterText: "Abonnieren Sie Neuheiten, Nachlieferungen, Einrichtungsideen und Lieferupdates.",
    emailPlaceholder: "E-Mail eingeben",
    subscribe: "Abonnieren",
    consent: "Ich habe den Datenschutzhinweis gelesen und möchte BoxSofa E-Mails erhalten.",
    thanks: "Abo-Interesse gespeichert. Das E-Mail-System wird vor dem Start verbunden.",
    about: "Über BoxSofa",
    aboutText: "BoxSofa konzentriert sich auf komprimierte Schaumsofas für europäische Wohnungen, Mietwohnungen, enge Treppen, kleine Aufzüge und flexible Stadträume.",
    info: "Informationen",
    contact: "Kontakt",
    payments: "Zahlungsarten",
    trust: "Danke für Ihr Vertrauen",
    shipping: "Lieferung",
    returns: "Rückgabe und Garantie",
    privacy: "Datenschutz",
    terms: "Nutzungsbedingungen",
    faq: "FAQ zu komprimierten Sofas",
    tracking: "Bestellverfolgung",
    reviews: "Kundenbewertungen",
    businessHours: "Mo-Fr 09:00-18:00 CET",
    whatsapp: "WhatsApp-Support reserviert",
    noAdvance: "Sichere Kartenzahlung über Stripe",
    sellerConfirm: "Bestellung nach Zahlung bestätigt",
    cardSoon: "Kostenlose Standardlieferung in Spanien",
    memberDiscount: "10% Mitgliedsrabatt nach EUR 300 bestätigtem Umsatz",
    trustScore: "Kundenbewertung 4.8 / 5",
    compressed: "Vakuumkomprimierte Verpackung",
    euDelivery: "EU-Lieferung geschätzt in 23-30 Tagen",
    copyright: "© 2026 BoxSofa Europe. Alle Rechte vorbehalten."
  }
};

export function SiteFooter() {
  const { language } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const copy = footerCopy[language] ?? footerCopy.en;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <footer className="site-footer" id="site-footer">
      <section className="footer-newsletter" aria-labelledby="footer-newsletter-title">
        <div>
          <h2 id="footer-newsletter-title">{copy.newsletterTitle}</h2>
          <p>{copy.newsletterText}</p>
        </div>
        <form className="newsletter-form" onSubmit={handleSubmit}>
          <div className="newsletter-row">
            <label className="sr-only" htmlFor="footer-email">
              {copy.emailPlaceholder}
            </label>
            <input id="footer-email" name="email" type="email" placeholder={copy.emailPlaceholder} required />
            <button type="submit">{copy.subscribe}</button>
          </div>
          <label className="newsletter-consent">
            <input type="checkbox" required />
            <span>{copy.consent}</span>
          </label>
          {submitted ? <p className="newsletter-success">{copy.thanks}</p> : null}
        </form>
      </section>

      <section className="footer-main" aria-label="BoxSofa footer">
        <div className="footer-column footer-about" id="about-boxsofa">
          <h2>{copy.about}</h2>
          <p>{copy.aboutText}</p>
          <div className="footer-trust-row" aria-label={copy.trust}>
            <span>{copy.trustScore}</span>
            <span>{copy.compressed}</span>
            <span>{copy.euDelivery}</span>
          </div>
        </div>

        <nav className="footer-column" aria-labelledby="footer-info-title">
          <h2 id="footer-info-title">{copy.info}</h2>
          <Link href="/shipping">{copy.shipping}</Link>
          <Link href="/returns">{copy.returns}</Link>
          <Link href="/privacy">{copy.privacy}</Link>
          <Link href="/terms">{copy.terms}</Link>
          <Link href="/faq">{copy.faq}</Link>
          <Link href="/orders">{copy.tracking}</Link>
          <a href="/product/chameleon-mario-sofa-01#product-reviews">{copy.reviews}</a>
        </nav>

        <address className="footer-column footer-contact">
          <h2>{copy.contact}</h2>
          <span>BoxSofa Europe</span>
          <a href="mailto:info@boxsofa.eu">info@boxsofa.eu</a>
          <span>{copy.businessHours}</span>
          <span>{copy.whatsapp}</span>
        </address>

        <div className="footer-column" id="footer-payment">
          <h2>{copy.payments}</h2>
          <div className="payment-badges">
            <span>{copy.noAdvance}</span>
            <span>{copy.sellerConfirm}</span>
            <span>{copy.cardSoon}</span>
            <span>{copy.memberDiscount}</span>
          </div>
        </div>
      </section>

      <section className="footer-seo-notes" aria-label="BoxSofa shopping notes">
        <article>
          <h2>{copy.faq}</h2>
          <p>{copy.euDelivery}. {copy.compressed}. {copy.shipping}.</p>
        </article>
        <article>
          <h2>{copy.returns}</h2>
          <p>{copy.sellerConfirm}. {copy.cardSoon}.</p>
        </article>
      </section>

      <div className="footer-bottom">
        <strong>BoxSofa</strong>
        <span>{copy.copyright}</span>
      </div>
    </footer>
  );
}
