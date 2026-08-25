import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CreateFolderForm } from "./create-folder-form";
import { DeleteFolderButton } from "./delete-folder-button";

export const dynamic = "force-dynamic";

export default async function FoldersPage() {
  const supabase = getSupabaseServerClient();
  const [{ data: folders }, { data: items }] = await Promise.all([
    supabase.from("folders").select("id,name,created_at").order("name"),
    supabase.from("folder_items").select("folder_id"),
  ]);

  const counts = new Map<string, number>();
  for (const row of items ?? []) counts.set(row.folder_id, (counts.get(row.folder_id) ?? 0) + 1);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6 sm:px-6">
      <h1 className="font-heading text-2xl font-extrabold tracking-tight text-white">Folders</h1>
      <CreateFolderForm />
      <ul className="overflow-hidden rounded-lg bg-card/60">
        {(folders ?? []).map((folder) => (
          <li key={folder.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/10">
            <Link href={`/folders/${folder.id}`} className="font-heading font-semibold text-white hover:underline">
              {folder.name}
            </Link>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{counts.get(folder.id) ?? 0} items</span>
              <DeleteFolderButton folderId={folder.id} />
            </div>
          </li>
        ))}
        {(folders ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">No folders yet.</li>
        )}
      </ul>
    </div>
  );
}
