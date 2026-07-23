import { getStyleProductsByCategory } from "@/lib/catalog";

export type Guide = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
  productSlugs: string[];
};

const featured = getStyleProductsByCategory("all").slice(0, 4).map((product) => product.slug);

export const guides: Guide[] = [
  {
    slug: "compressed-sofa-small-apartment-spain",
    title: "Compressed Sofas for Small Apartments in Spain",
    description:
      "A practical guide to choosing compressed foam sofas for compact flats, rentals and city apartments in Spain.",
    intro:
      "Small apartments need furniture that can enter the building before it can look good in the room. BoxSofa focuses on compressed foam sofas that ship compactly, recover after unpacking and work for flexible city living.",
    sections: [
      {
        title: "Why compressed packaging helps",
        body:
          "A compressed sofa reduces delivery volume, making it easier to move through shared entrances, corridors, stairs and compact lifts. It is especially useful when a traditional sofa would need special handling."
      },
      {
        title: "What to check before ordering",
        body:
          "Measure the room, the door, the lift and the tightest staircase corner. Compare those measurements with both the finished size and the package size shown on each BoxSofa product page."
      },
      {
        title: "Delivery and payment",
        body:
          "BoxSofa offers free basic delivery across Europe, estimated delivery in 23-30 working days, secure Stripe card payment and a 14-day return window after delivery."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-for-narrow-stairs-no-elevator",
    title: "Sofas for Narrow Stairs and Buildings Without an Elevator",
    description:
      "How to choose a sofa when your building has narrow stairs, no elevator or difficult delivery access.",
    intro:
      "Many older European buildings were not designed around bulky furniture delivery. A compressed sofa gives you more options because the package is smaller before expansion.",
    sections: [
      {
        title: "Start from the delivery route",
        body:
          "Before comparing styles, check the smallest point in the delivery route: entry door, stair turn, corridor width and apartment door. Package dimensions matter as much as the final sofa size."
      },
      {
        title: "Choose flexible formats",
        body:
          "Single-seat, modular and sofa-bed formats are usually easier to place in difficult homes. If the room may change later, choose a lighter layout rather than one large traditional frame."
      },
      {
        title: "Let the sofa recover",
        body:
          "After opening the vacuum package, allow 24-72 hours for the foam to recover. Keep space around the sofa during the first recovery period."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-in-a-box-europe",
    title: "Sofa in a Box for European Homes",
    description:
      "What sofa-in-a-box means, how compressed foam sofas recover and when this format makes sense for European buyers.",
    intro:
      "A sofa in a box is built around delivery practicality: compact shipment first, full-size comfort after unpacking. It is a strong fit for rentals, student homes, guest rooms and apartments with access limits.",
    sections: [
      {
        title: "What arrives at your door",
        body:
          "The sofa arrives vacuum-compressed in a smaller package. After unpacking, the foam expands toward its finished shape. Product pages show the finished dimensions and package details when available."
      },
      {
        title: "Who it suits best",
        body:
          "This format is useful for renters, small apartments, flexible rooms, older buildings and homes where delivery access is the real problem."
      },
      {
        title: "How to buy with less risk",
        body:
          "Choose a product with clear photos, video, dimensions, secure payment and published return terms. BoxSofa displays delivery, payment and return information before checkout."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "compressed-sofa-delivery-recovery",
    title: "Compressed Sofa Delivery and 24-72 Hour Recovery",
    description:
      "What happens after a compressed sofa is delivered, how long recovery takes and what buyers should expect.",
    intro:
      "Compressed foam furniture needs a short recovery period after opening. Understanding that process helps set the right expectation before purchase.",
    sections: [
      {
        title: "Opening the package",
        body:
          "Place the package in the room where the sofa will be used, open carefully and give the foam enough space to expand. Avoid judging the final shape in the first few hours."
      },
      {
        title: "Recovery window",
        body:
          "Most BoxSofa products list a 24-72 hour expansion time. Room temperature, fabric tension and foam thickness can affect the exact recovery speed."
      },
      {
        title: "When to contact support",
        body:
          "If a product remains materially different from the product page after the recovery window, contact info@boxsofa.eu with the order number and clear photos."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "rental-apartment-sofa-bed",
    title: "Foam Sofa Beds for Rental Apartments and Guest Rooms",
    description:
      "A buying guide for flexible compressed foam sofa beds in rental apartments, guest rooms and compact homes.",
    intro:
      "For a rental apartment or guest room, the best sofa is often the one that is easy to deliver, easy to place and flexible enough for daily lounging or occasional sleeping.",
    sections: [
      {
        title: "Think in use cases",
        body:
          "Decide whether the sofa will be used mainly for sitting, lounging, guests or a mix of all three. Sofa-bed and foldable formats are useful when one room has multiple jobs."
      },
      {
        title: "Protect the room layout",
        body:
          "Measure both sofa mode and unfolded mode. Leave walking space around doors, wardrobes and balcony access so the room stays usable."
      },
      {
        title: "Why compressed delivery helps rentals",
        body:
          "Rental homes often have access limits and changing layouts. A compressed foam sofa reduces delivery friction and is easier to reposition than a rigid traditional sofa."
      }
    ],
    productSlugs: featured
  }
];

export const spanishGuides: Guide[] = [
  {
    slug: "sofa-comprimido-piso-pequeno-espana",
    title: "Sofás Comprimidos para Pisos Pequeños en España",
    description:
      "Guía práctica para elegir un sofá comprimido para pisos compactos, alquileres y apartamentos urbanos en España.",
    intro:
      "En un piso pequeño, el sofá primero tiene que entrar por la puerta, la escalera o el ascensor. BoxSofa trabaja con sofás de espuma comprimida pensados para entregarse en formato compacto y recuperar su forma tras abrir el paquete.",
    sections: [
      {
        title: "Por qué ayuda el embalaje comprimido",
        body:
          "Un sofá comprimido reduce el volumen de entrega y facilita el paso por portales, pasillos, escaleras estrechas y ascensores pequeños. Es útil cuando un sofá tradicional exige transporte especial."
      },
      {
        title: "Qué medir antes de comprar",
        body:
          "Mide la habitación, la puerta, el ascensor y el giro más estrecho de la escalera. Compara esas medidas con el tamaño final y el tamaño del paquete indicados en cada producto."
      },
      {
        title: "Entrega y pago",
        body:
          "BoxSofa ofrece entrega básica gratuita en toda Europa, pago seguro con tarjeta mediante Stripe y entrega estimada en 23-30 días laborables."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-escaleras-estrechas-sin-ascensor",
    title: "Sofás para Escaleras Estrechas y Edificios sin Ascensor",
    description:
      "Cómo elegir un sofá si tu edificio tiene escaleras estrechas, no tiene ascensor o el acceso es complicado.",
    intro:
      "Muchos edificios antiguos no están preparados para muebles voluminosos. Un sofá comprimido ofrece más margen porque llega en un paquete más pequeño antes de expandirse.",
    sections: [
      {
        title: "Empieza por la ruta de entrega",
        body:
          "Antes de comparar estilos, revisa el punto más estrecho: portal, giro de escalera, pasillo y puerta del piso. El tamaño del paquete importa tanto como el tamaño final."
      },
      {
        title: "Elige formatos flexibles",
        body:
          "Los formatos individuales, modulares y sofá cama suelen ser más fáciles de colocar en viviendas difíciles. Si la distribución puede cambiar, evita una estructura demasiado rígida."
      },
      {
        title: "Deja recuperar la espuma",
        body:
          "Tras abrir el paquete al vacío, deja 24-72 horas para que la espuma recupere su forma. Mantén espacio alrededor durante el primer periodo de expansión."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-en-caja-europa",
    title: "Sofá en Caja para Hogares Europeos",
    description:
      "Qué significa comprar un sofá en caja, cómo se expande y cuándo conviene este formato en Europa.",
    intro:
      "Un sofá en caja prioriza la entrega: primero llega compacto y después recupera su tamaño de uso. Es una opción práctica para alquileres, habitaciones de invitados, estudios y viviendas con acceso limitado.",
    sections: [
      {
        title: "Qué llega a casa",
        body:
          "El sofá llega comprimido al vacío en un paquete más manejable. Al abrirlo, la espuma empieza a expandirse hasta acercarse a su forma final."
      },
      {
        title: "Para quién tiene sentido",
        body:
          "Funciona especialmente bien para inquilinos, pisos pequeños, habitaciones flexibles, edificios antiguos y casas donde el problema real es la entrega."
      },
      {
        title: "Cómo comprar con menos riesgo",
        body:
          "Busca fotos claras, video, medidas, pago seguro y condiciones de devolución publicadas. BoxSofa muestra la entrega, el pago y la política de devoluciones antes del checkout."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "recuperacion-sofa-comprimido-24-72-horas",
    title: "Entrega y Recuperación de un Sofá Comprimido en 24-72 Horas",
    description:
      "Qué ocurre después de recibir un sofá comprimido, cuánto tarda en recuperar la forma y qué debe esperar el comprador.",
    intro:
      "Los muebles de espuma comprimida necesitan un periodo corto de recuperación tras abrir el paquete. Entender ese proceso ayuda a comprar con expectativas claras.",
    sections: [
      {
        title: "Abrir el paquete",
        body:
          "Coloca el paquete en la habitación donde usarás el sofá, abre con cuidado y deja espacio para que la espuma se expanda. No juzgues la forma final en las primeras horas."
      },
      {
        title: "Tiempo de recuperación",
        body:
          "La mayoría de productos BoxSofa indican una expansión de 24-72 horas. La temperatura, el tejido y el grosor de la espuma pueden afectar la velocidad exacta."
      },
      {
        title: "Cuándo contactar con soporte",
        body:
          "Si el producto sigue siendo claramente distinto a la página después del periodo de recuperación, escribe a info@boxsofa.eu con el número de pedido y fotos claras."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-cama-piso-alquiler",
    title: "Sofá Cama de Espuma para Pisos de Alquiler y Habitaciones de Invitados",
    description:
      "Guía para elegir un sofá cama comprimido y flexible para pisos de alquiler, habitaciones de invitados y espacios compactos.",
    intro:
      "En un piso de alquiler o una habitación de invitados, el mejor sofá suele ser el que se entrega con facilidad, se coloca sin complicaciones y sirve para descansar o recibir visitas.",
    sections: [
      {
        title: "Piensa en el uso real",
        body:
          "Decide si se usará para sentarse, tumbarse, recibir invitados o combinar varias funciones. Los formatos plegables o sofá cama ayudan cuando una habitación tiene varios usos."
      },
      {
        title: "Protege la distribución",
        body:
          "Mide tanto el modo sofá como el modo extendido. Deja espacio para puertas, armarios y acceso al balcón, de modo que la habitación siga siendo cómoda."
      },
      {
        title: "Ventaja en viviendas de alquiler",
        body:
          "Los alquileres suelen tener accesos limitados y distribuciones cambiantes. Un sofá de espuma comprimida reduce la fricción de entrega y es más fácil de recolocar."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-comprimido-madrid-piso-pequeno",
    title: "Sofá Comprimido para Pisos Pequeños en Madrid",
    description:
      "Consejos para elegir un sofá comprimido si vives en un piso pequeño, alquiler o edificio con acceso complicado en Madrid.",
    intro:
      "En Madrid, muchos pisos tienen portales estrechos, escaleras antiguas o ascensores compactos. Un sofá comprimido ayuda a reducir el problema de entrada antes de convertirse en un sofá de uso diario.",
    sections: [
      {
        title: "Comprueba portal, ascensor y giro de escalera",
        body:
          "Antes de comprar, mide el punto más estrecho entre la calle y el salón. El paquete comprimido suele ser más fácil de mover que un sofá rígido, pero las medidas siguen siendo importantes."
      },
      {
        title: "Piensa en pisos de alquiler",
        body:
          "Si el piso es temporal o puede cambiar la distribución, un formato individual, modular o sofá cama suele ser más flexible que una pieza grande tradicional."
      },
      {
        title: "Entrega en España",
        body:
          "BoxSofa ofrece entrega básica gratuita en toda Europa, pago seguro mediante Stripe y entrega estimada en 23-30 días laborables."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-comprimido-barcelona-escaleras-estrechas",
    title: "Sofá Comprimido para Escaleras Estrechas en Barcelona",
    description:
      "Guía para comprar un sofá comprimido en Barcelona cuando el edificio tiene escaleras estrechas, ascensor pequeño o acceso difícil.",
    intro:
      "En Barcelona, los pisos urbanos y edificios antiguos pueden complicar la entrega de muebles grandes. Un sofá comprimido llega en un paquete más manejable y recupera su forma después de abrirlo.",
    sections: [
      {
        title: "Mide antes de elegir el modelo",
        body:
          "Revisa anchura del portal, escalera, ascensor y puerta del piso. Compara esas medidas con el tamaño del paquete y el tamaño final del sofá."
      },
      {
        title: "Elige formatos que entren mejor",
        body:
          "Los sofás individuales, modulares y plegables suelen ser mejores para accesos difíciles porque permiten resolver el problema por partes."
      },
      {
        title: "Recuperación tras abrir",
        body:
          "Después de abrir el paquete, deja 24-72 horas para que la espuma se expanda. Evita colocar peso excesivo durante las primeras horas."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-en-caja-valencia-alquiler",
    title: "Sofá en Caja para Pisos de Alquiler en Valencia",
    description:
      "Cómo elegir un sofá en caja para pisos de alquiler, estudios y habitaciones flexibles en Valencia.",
    intro:
      "Un piso de alquiler necesita muebles que entren fácil, funcionen en espacios cambiantes y no compliquen la entrega. El formato sofá en caja está pensado para esa realidad.",
    sections: [
      {
        title: "Prioriza flexibilidad",
        body:
          "Si el salón también sirve como zona de invitados o teletrabajo, considera un sofá cama o formato modular antes que una estructura rígida."
      },
      {
        title: "Comprueba modo sofá y modo extendido",
        body:
          "Mide tanto la posición cerrada como la posición desplegada. Deja espacio para puertas, armarios y paso diario."
      },
      {
        title: "Compra con señales claras",
        body:
          "Busca fotos, video, medidas, pago seguro y política de devolución publicada. BoxSofa muestra estas señales antes del checkout."
      }
    ],
    productSlugs: featured
  },
  {
    slug: "sofa-comprimido-malaga-apartamento",
    title: "Sofá Comprimido para Apartamentos en Málaga",
    description:
      "Guía para elegir un sofá comprimido para apartamentos, segundas residencias y viviendas compactas en Málaga.",
    intro:
      "En apartamentos compactos o segundas residencias, la entrega y el espacio útil importan tanto como el estilo. Un sofá comprimido permite resolver primero el acceso y después la comodidad.",
    sections: [
      {
        title: "Evita sorpresas con las medidas",
        body:
          "Comprueba puerta, pasillo, ascensor y zona final de uso. Las medidas del paquete ayudan a decidir si el sofá puede entrar sin transporte especial."
      },
      {
        title: "Piensa en uso ocasional e invitados",
        body:
          "Si el apartamento recibe visitas, un sofá cama o formato flexible puede aportar más valor que un sofá tradicional de una sola función."
      },
      {
        title: "Entrega y soporte",
        body:
          "La entrega básica en España es gratuita. Para dudas antes o después del pedido, puedes contactar con BoxSofa en info@boxsofa.eu."
      }
    ],
    productSlugs: featured
  }
];

export function getGuideBySlug(slug: string) {
  return guides.find((guide) => guide.slug === slug);
}

export function getSpanishGuideBySlug(slug: string) {
  return spanishGuides.find((guide) => guide.slug === slug);
}

export function getRelatedGuides(slug: string, language: "en" | "es", limit = 3) {
  const source = language === "es" ? spanishGuides : guides;
  const currentIndex = source.findIndex((guide) => guide.slug === slug);
  const ordered = currentIndex >= 0
    ? [...source.slice(currentIndex + 1), ...source.slice(0, currentIndex)]
    : source;

  return ordered.filter((guide) => guide.slug !== slug).slice(0, limit);
}

export function getSpanishGuideForEnglishSlug(slug: string) {
  const index = guides.findIndex((guide) => guide.slug === slug);
  return index >= 0 ? spanishGuides[index] : undefined;
}

export function getEnglishGuideForSpanishSlug(slug: string) {
  const index = spanishGuides.findIndex((guide) => guide.slug === slug);
  return index >= 0 ? guides[index] : undefined;
}
