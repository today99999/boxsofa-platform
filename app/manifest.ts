import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BoxSofa Data Center",
    short_name: "BoxSofa Data",
    description: "BoxSofa owner operations and analytics center",
    start_url: "/data-center",
    scope: "/data-center",
    display: "standalone",
    background_color: "#f4f6f5",
    theme_color: "#173f35",
    icons: [
      { src: "/assets/brand/boxsofa-mark.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/assets/brand/boxsofa-mark-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
