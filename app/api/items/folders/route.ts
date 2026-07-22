import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

interface ItemFolderBody {
  folderId?: string;
  itemType?: string;
  itemId?: string;
}

function validate(body: ItemFolderBody | null) {
  const folderId = body?.folderId;
  const itemType = body?.itemType;
  const itemId = body?.itemId;
  if (!folderId || !itemId || (itemType !== "track" && itemType !== "album")) {
    return null;
  }
  return { folderId, itemType, itemId };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = validate(body);
  if (!parsed) return NextResponse.json({ error: "folderId, itemType ('track'|'album'), and itemId are required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("folder_items")
    .upsert(
      { folder_id: parsed.folderId, item_type: parsed.itemType, item_id: parsed.itemId },
      { onConflict: "folder_id,item_type,item_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = validate(body);
  if (!parsed) return NextResponse.json({ error: "folderId, itemType ('track'|'album'), and itemId are required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("folder_items")
    .delete()
    .eq("folder_id", parsed.folderId)
    .eq("item_type", parsed.itemType)
    .eq("item_id", parsed.itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
