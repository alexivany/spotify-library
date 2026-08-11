import { NextRequest, NextResponse } from "next/server";
import { runEnrichment } from "@/lib/musicbrainz/enrich";

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const counts = await runEnrichment();
    return NextResponse.json({ status: "success", counts });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

// Vercel Cron invokes via GET and attaches `Authorization: Bearer <CRON_SECRET>`
// when the CRON_SECRET env var is set. POST is kept for manual/scripted triggers.
export const GET = handle;
export const POST = handle;
