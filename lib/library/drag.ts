export const LIBRARY_ITEM_MIME = "application/x-library-item";

export interface LibraryItemDragPayload {
  itemType: "track" | "album";
  itemId: string;
}
