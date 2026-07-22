import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/tags/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const patch: { name?: string; color?: string | null } = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body?.color === "string" || body?.color === null) patch.color = body.color;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "name or color is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("tags").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tag: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/tags/[id]">) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
