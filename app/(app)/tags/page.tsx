import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CreateTagForm } from "./create-tag-form";
import { DeleteTagButton } from "./delete-tag-button";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const supabase = getSupabaseServerClient();
  const { data: tags } = await supabase.from("tags").select("id,name,color,created_at").order("name");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-6">
      <h1 className="font-heading text-2xl font-extrabold tracking-tight text-white">Tags</h1>
      <CreateTagForm />
      <ul className="overflow-hidden rounded-lg bg-card/60">
        {(tags ?? []).map((tag) => (
          <li key={tag.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/10">
            <div className="flex items-center gap-2">
              <span
                className="size-3 rounded-full border border-white/20"
                style={{ backgroundColor: tag.color ?? "transparent" }}
              />
              <span className="font-heading font-semibold text-white">{tag.name}</span>
            </div>
            <DeleteTagButton tagId={tag.id} />
          </li>
        ))}
        {(tags ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">No tags yet.</li>
        )}
      </ul>
    </div>
  );
}
