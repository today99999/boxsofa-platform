import type { MetadataRoute } from "next";
import { categories, getStyleProductsByCategory } from "@/lib/catalog";
import { guides } from "@/lib/guides";

const siteUrl = "https://boxsofa.eu";
const policyRoutes = ["shipping", "returns", "privacy", "terms", "faq"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const categoryRoutes = categories.map((category) => ({
    url: `${siteUrl}/category/${category.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: category.slug === "all" ? 0.9 : 0.7
  }));
  const productRoutes = getStyleProductsByCategory("all").map((product) => ({
    url: `${siteUrl}/product/${product.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8
  }));
  const policyPageRoutes = policyRoutes.map((route) => ({
    url: `${siteUrl}/${route}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: route === "privacy" || route === "terms" ? 0.6 : 0.7
  }));
  const guideRoutes = guides.map((guide) => ({
    url: `${siteUrl}/guides/${guide.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.75
  }));

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1
    },
    ...categoryRoutes,
    ...productRoutes,
    ...guideRoutes,
    ...policyPageRoutes
  ];
}
