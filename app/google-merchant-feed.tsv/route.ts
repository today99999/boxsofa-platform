import { products } from "@/lib/catalog";
import { buildGoogleMerchantFeed } from "@/lib/google-merchant-feed";

export const dynamic = "force-static";

export function GET() {
  const feed = buildGoogleMerchantFeed(products, "https://boxsofa.eu");

  return new Response(feed, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Disposition": 'inline; filename="boxsofa-google-products.tsv"',
      "Content-Type": "text/tab-separated-values; charset=utf-8"
    }
  });
}
