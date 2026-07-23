export type FaqItem = {
  question: string;
  answer: string;
};

export const productFaqs: FaqItem[] = [
  {
    question: "Will the sofa recover its shape after being compressed?",
    answer:
      "Yes. BoxSofa products are designed to expand after unpacking. Most styles need 24-72 hours to recover; room temperature, fabric tension and foam thickness can affect the exact timing."
  },
  {
    question: "Is basic delivery free across Europe?",
    answer:
      "Yes. Basic delivery across Europe is free for all BoxSofa sofas. Estimated delivery is 23-30 working days, and tracking details are provided after shipment."
  },
  {
    question: "Can it work for narrow stairs or a small lift?",
    answer:
      "That is the main reason to choose a compressed sofa. Check the package dimensions on the product page against your entrance, stairs, lift and apartment door before ordering."
  },
  {
    question: "How is payment handled?",
    answer:
      "Online card payment is processed securely through Stripe. BoxSofa does not store your full card details."
  },
  {
    question: "What is the return window?",
    answer:
      "Customers in Spain may request a return within 14 calendar days after delivery. Non-quality return shipping is paid by the customer; defective, damaged or incorrect items are handled by BoxSofa according to the returns policy."
  }
];

export const spanishProductFaqs: FaqItem[] = [
  {
    question: "¿El sofá recupera la forma después de estar comprimido?",
    answer:
      "Sí. Los productos BoxSofa están diseñados para expandirse después de abrir el paquete. La mayoría necesita 24-72 horas; la temperatura, el tejido y el grosor de la espuma pueden influir."
  },
  {
    question: "¿La entrega básica es gratuita en toda Europa?",
    answer:
      "Sí. La entrega básica en toda Europa es gratuita para todos los sofás BoxSofa. La entrega estimada es de 23-30 días laborables y el seguimiento se facilita tras el envío."
  },
  {
    question: "¿Sirve para escaleras estrechas o ascensores pequeños?",
    answer:
      "Ese es uno de los motivos principales para elegir un sofá comprimido. Compara las medidas del paquete con el portal, la escalera, el ascensor y la puerta del piso antes de comprar."
  },
  {
    question: "¿Cómo se realiza el pago?",
    answer:
      "El pago online con tarjeta se procesa de forma segura mediante Stripe. BoxSofa no guarda los datos completos de tu tarjeta."
  },
  {
    question: "¿Cuál es el plazo de devolución?",
    answer:
      "Los clientes en España pueden solicitar una devolución dentro de los 14 días naturales posteriores a la entrega. En devoluciones no relacionadas con calidad, el coste de retorno lo asume el cliente."
  }
];

export function buildFaqJsonLd(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };
}
