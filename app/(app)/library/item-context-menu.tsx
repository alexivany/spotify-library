"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Disc3, ExternalLink, Filter, FolderPlus, Info, TagPlus } from "lucide-react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { LIBRARY_ITEM_MIME, type LibraryItemDragPayload } from "@/lib/library/drag";
import type { MenuData } from "@/lib/library/menu-data";
import { postAssignment, type NamedItem } from "./item-actions";

function useAssignmentState(itemType: "track" | "album", itemId: string, initialFolderIds: string[], initialTagIds: string[]) {
  const [folderIds, setFolderIds] = useState(() => new Set(initialFolderIds));
  const [tagIds, setTagIds] = useState(() => new Set(initialTagIds));

  function toggleFolder(folderId: string) {
    const wasSelected = folderIds.has(folderId);
    const next = new Set(folderIds);
    if (wasSelected) next.delete(folderId);
    else next.add(folderId);
    setFolderIds(next);
    postAssignment("/api/items/folders", wasSelected ? "DELETE" : "POST", { folderId, itemType, itemId }).catch(() =>
      setFolderIds(folderIds),
    );
  }

  function toggleTag(tagId: string) {
    const wasSelected = tagIds.has(tagId);
    const next = new Set(tagIds);
    if (wasSelected) next.delete(tagId);
    else next.add(tagId);
    setTagIds(next);
    postAssignment("/api/items/tags", wasSelected ? "DELETE" : "POST", { tagId, itemType, itemId }).catch(() =>
      setTagIds(tagIds),
    );
  }

  return { folderIds, tagIds, toggleFolder, toggleTag };
}

interface LibraryItemMenuProps extends MenuData {
  itemType: "track" | "album";
  itemId: string;
  folders: NamedItem[];
  tags: NamedItem[];
  initialFolderIds: string[];
  initialTagIds: string[];
}

function MenuBody({
  itemType,
  itemId,
  folders,
  tags,
  initialFolderIds,
  initialTagIds,
  filters,
  spotifyUrl,
  albumSpotifyUrl,
  details,
  detailsTitle,
  detailsOpen,
  setDetailsOpen,
}: LibraryItemMenuProps & { detailsOpen: boolean; setDetailsOpen: (open: boolean) => void }) {
  const router = useRouter();
  const { folderIds, tagIds, toggleFolder, toggleTag } = useAssignmentState(itemType, itemId, initialFolderIds, initialTagIds);

  return (
    <>
      <ContextMenuContent>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderPlus /> Add to folder
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {folders.length === 0 ? (
              <ContextMenuItem disabled>No folders yet</ContextMenuItem>
            ) : (
              folders.map((folder) => (
                <ContextMenuCheckboxItem
                  key={folder.id}
                  checked={folderIds.has(folder.id)}
                  onCheckedChange={() => toggleFolder(folder.id)}
                >
                  {folder.name}
                </ContextMenuCheckboxItem>
              ))
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <TagPlus /> Add to tag
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {tags.length === 0 ? (
              <ContextMenuItem disabled>No tags yet</ContextMenuItem>
            ) : (
              tags.map((tag) => (
                <ContextMenuCheckboxItem key={tag.id} checked={tagIds.has(tag.id)} onCheckedChange={() => toggleTag(tag.id)}>
                  {tag.name}
                </ContextMenuCheckboxItem>
              ))
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {filters.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Filter /> Filter library by
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {filters.map((facet) => (
                  <ContextMenuItem key={facet.label} onClick={() => router.push(facet.href)}>
                    {facet.label}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => window.open(spotifyUrl, "_blank", "noopener,noreferrer")}>
          <ExternalLink /> Open in Spotify
        </ContextMenuItem>
        {albumSpotifyUrl && (
          <ContextMenuItem onClick={() => window.open(albumSpotifyUrl, "_blank", "noopener,noreferrer")}>
            <Disc3 /> Go to album
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => setDetailsOpen(true)}>
          <Info /> View {itemType === "album" ? "album" : "track"} information
        </ContextMenuItem>
      </ContextMenuContent>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8">{detailsTitle}</DialogTitle>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            {details.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="text-right font-medium text-white">{row.value}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Tags</dt>
              <dd className="text-right font-medium text-white">
                {tags.filter((tag) => tagIds.has(tag.id)).map((tag) => tag.name).join(", ") || "—"}
              </dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}

function startDrag(e: React.DragEvent, itemType: "track" | "album", itemId: string) {
  const payload: LibraryItemDragPayload = { itemType, itemId };
  e.dataTransfer.setData(LIBRARY_ITEM_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("a, button, input, [role='menuitem']") !== null;
}

export function LibraryCardMenu({
  itemType,
  itemId,
  className,
  children,
  ...menuProps
}: LibraryItemMenuProps & { className?: string; children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        draggable
        onDragStart={(e) => {
          startDrag(e, itemType, itemId);
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onClick={(e) => {
          if (isInteractiveTarget(e.target)) return;
          setDetailsOpen(true);
        }}
        className={cn(className, "cursor-pointer", dragging && "opacity-40")}
      >
        {children}
      </ContextMenuTrigger>
      <MenuBody itemType={itemType} itemId={itemId} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} {...menuProps} />
    </ContextMenu>
  );
}

export function LibraryRowMenu({
  itemType,
  itemId,
  children,
  ...menuProps
}: LibraryItemMenuProps & { children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <TableRow
            draggable
            onDragStart={(e) => {
              startDrag(e, itemType, itemId);
              setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            onClick={(e) => {
              if (isInteractiveTarget(e.target)) return;
              setDetailsOpen(true);
            }}
            className={cn("cursor-pointer", dragging && "opacity-40")}
          />
        }
      >
        {children}
      </ContextMenuTrigger>
      <MenuBody itemType={itemType} itemId={itemId} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} {...menuProps} />
    </ContextMenu>
  );
}
