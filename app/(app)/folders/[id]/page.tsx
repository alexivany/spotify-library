import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { RenameFolderForm } from "./rename-folder-form";
import { RemoveFromFolderButton } from "./remove-from-folder-button";

const NO_MATCH_SENTINEL = "00000000-0000-0000-0000-000000000000";

export const dynamic = "force-dynamic";

export default async function FolderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: folder } = await supabase.from("folders").select("id,name").eq("id", id).maybeSingle();
  if (!folder) notFound();

  const { data: items } = await supabase.from("folder_items").select("item_type,item_id").eq("folder_id", id);
  const trackIds = (items ?? []).filter((i) => i.item_type === "track").map((i) => i.item_id);
  const albumIds = (items ?? []).filter((i) => i.item_type === "album").map((i) => i.item_id);

  const [{ data: tracks }, { data: albums }] = await Promise.all([
    supabase
      .from("tracks")
      .select("id,name,albums(name)")
      .in("id", trackIds.length ? trackIds : [NO_MATCH_SENTINEL]),
    supabase
      .from("albums")
      .select("id,name,album_type")
      .in("id", albumIds.length ? albumIds : [NO_MATCH_SENTINEL]),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-6 py-6">
      <RenameFolderForm folderId={folder.id} initialName={folder.name} />

      <div className="space-y-2">
        <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Tracks</h2>
        <ul className="overflow-hidden rounded-lg bg-card/60">
          {(tracks ?? []).map((track) => (
            <li key={track.id} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-white/10">
              <span className="text-white">
                {track.name}
                {track.albums?.name ? ` — ${track.albums.name}` : ""}
              </span>
              <RemoveFromFolderButton folderId={folder.id} itemType="track" itemId={track.id} />
            </li>
          ))}
          {(tracks ?? []).length === 0 && (
            <li className="px-4 py-4 text-sm text-muted-foreground">No tracks in this folder.</li>
          )}
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Albums</h2>
        <ul className="overflow-hidden rounded-lg bg-card/60">
          {(albums ?? []).map((album) => (
            <li key={album.id} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-white/10">
              <span className="text-white">{album.name}</span>
              <RemoveFromFolderButton folderId={folder.id} itemType="album" itemId={album.id} />
            </li>
          ))}
          {(albums ?? []).length === 0 && (
            <li className="px-4 py-4 text-sm text-muted-foreground">No albums in this folder.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
