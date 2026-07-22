import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/folders/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("folders").update({ name }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folder: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/folders/[id]">) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
