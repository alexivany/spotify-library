import { NextResponse } from "next/server";
import { runSync } from "@/lib/spotify/sync";

export async function POST() {
  try {
    const counts = await runSync();
    return NextResponse.json({ status: "success", counts });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
