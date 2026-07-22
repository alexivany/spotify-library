import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

interface ItemTagBody {
  tagId?: string;
  itemType?: string;
  itemId?: string;
}

function validate(body: ItemTagBody | null) {
  const tagId = body?.tagId;
  const itemType = body?.itemType;
  const itemId = body?.itemId;
  if (!tagId || !itemId || (itemType !== "track" && itemType !== "album")) {
    return null;
  }
  return { tagId, itemType, itemId };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = validate(body);
  if (!parsed) return NextResponse.json({ error: "tagId, itemType ('track'|'album'), and itemId are required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("item_tags")
    .upsert(
      { tag_id: parsed.tagId, item_type: parsed.itemType, item_id: parsed.itemId },
      { onConflict: "tag_id,item_type,item_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = validate(body);
  if (!parsed) return NextResponse.json({ error: "tagId, itemType ('track'|'album'), and itemId are required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("item_tags")
    .delete()
    .eq("tag_id", parsed.tagId)
    .eq("item_type", parsed.itemType)
    .eq("item_id", parsed.itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
