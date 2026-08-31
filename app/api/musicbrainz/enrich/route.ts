import { NextResponse } from "next/server";
import { runEnrichment } from "@/lib/musicbrainz/enrich";

export async function POST() {
  try {
    const outcome = await runEnrichment();
    return NextResponse.json(outcome);
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
