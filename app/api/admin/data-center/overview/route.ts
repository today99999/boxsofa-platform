import { NextResponse } from "next/server";
import { loadDataCenterOverview, toPublicOverviewErrorMessage } from "@/lib/server/data-center-overview";
import { requireAdminAccess } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    if (access.reason === "supabase_not_configured") {
      return NextResponse.json({ ok: false, message: "Data center is not configured." }, { status: 503 });
    }
    if (access.reason === "not_authenticated") {
      return NextResponse.json({ ok: false, message: "Merchant login is required." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, message: "Owner access is required." }, { status: 403 });
  }
  if (access.role !== "owner") {
    return NextResponse.json({ ok: false, message: "Owner access is required." }, { status: 403 });
  }

  try {
    const overview = await loadDataCenterOverview(new URL(request.url).searchParams.get("range"));
    return NextResponse.json({ ok: true, overview });
  } catch (error) {
    console.error("Data center overview failed.", error);
    return NextResponse.json({ ok: false, message: toPublicOverviewErrorMessage(error) }, { status: 500 });
  }
}
