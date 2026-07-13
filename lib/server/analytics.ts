function inferSource(referrer: string) {
  const text = referrer.toLowerCase();
  if (!text) return "direct";
  if (text.includes("tiktok")) return "tiktok";
  if (text.includes("instagram")) return "instagram";
  if (text.includes("facebook") || text.includes("fb.")) return "facebook";
  if (text.includes("youtube") || text.includes("youtu.be")) return "youtube";
  if (text.includes("x.com") || text.includes("twitter")) return "x";
  if (text.includes("google")) return "google";
  return "referral";
}

export function trackOrderEventFields(request: Request) {
  const url = new URL(request.url);
  const referrer = request.headers.get("referer") ?? "";
  const utmSource = url.searchParams.get("utm_source");

  return {
    source: utmSource?.toLowerCase() || inferSource(referrer),
    utm_source: utmSource,
    utm_medium: url.searchParams.get("utm_medium"),
    utm_campaign: url.searchParams.get("utm_campaign"),
    referrer: referrer || null
  };
}
