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
          "BoxSofa offers free basic delivery in Spain, estimated cross-border delivery in 23-30 working days, secure Stripe card payment and a 14-day return window after delivery."
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

export function getGuideBySlug(slug: string) {
  return guides.find((guide) => guide.slug === slug);
}
