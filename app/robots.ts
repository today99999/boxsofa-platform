import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/cart", "/login", "/orders"]
      }
    ],
    sitemap: "https://boxsofa.eu/sitemap.xml"
  };
}
