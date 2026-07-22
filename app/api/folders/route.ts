import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data: folders, error } = await supabase.from("folders").select("id,name,created_at").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: items, error: itemsError } = await supabase.from("folder_items").select("folder_id");
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const row of items ?? []) {
    counts.set(row.folder_id, (counts.get(row.folder_id) ?? 0) + 1);
  }

  return NextResponse.json({
    folders: (folders ?? []).map((f) => ({ ...f, itemCount: counts.get(f.id) ?? 0 })),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("folders").insert({ name }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folder: data }, { status: 201 });
}
