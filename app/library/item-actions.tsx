"use client";

import { useState } from "react";
import { FolderPlus, TagPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface NamedItem {
  id: string;
  name: string;
}

async function postAssignment(url: string, method: "POST" | "DELETE", body: Record<string, string>) {
  await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function AssignmentPopover({
  label,
  emptyLabel,
  options,
  selectedIds,
  onToggle,
  icon: Icon,
  iconOnly,
}: {
  label: string;
  emptyLabel: string;
  options: NamedItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  icon: LucideIcon;
  iconOnly?: boolean;
}) {
  const count = selectedIds.size;

  return (
    <Popover>
      <PopoverTrigger
        render={
          iconOnly ? (
            <Button
              variant="outline"
              size="icon-sm"
              className="relative"
              aria-label={count > 0 ? `${label} (${count})` : label}
              title={label}
            >
              <Icon className="size-3.5" />
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] leading-none font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </Button>
          ) : (
            <Button variant="outline" size="xs">
              {label}
              {count > 0 ? ` (${count})` : ""}
            </Button>
          )
        }
      />
      <PopoverContent className="w-56" align="end">
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {options.length === 0 && <p className="text-xs text-muted-foreground">{emptyLabel}</p>}
          {options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selectedIds.has(option.id)} onCheckedChange={() => onToggle(option.id)} />
              {option.name}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ItemActions({
  itemType,
  itemId,
  folders,
  tags,
  initialFolderIds,
  initialTagIds,
  iconOnly,
}: {
  itemType: "track" | "album";
  itemId: string;
  folders: NamedItem[];
  tags: NamedItem[];
  initialFolderIds: string[];
  initialTagIds: string[];
  iconOnly?: boolean;
}) {
  const [folderIds, setFolderIds] = useState(new Set(initialFolderIds));
  const [tagIds, setTagIds] = useState(new Set(initialTagIds));

  function toggleFolder(folderId: string) {
    const wasSelected = folderIds.has(folderId);
    const next = new Set(folderIds);
    if (wasSelected) next.delete(folderId);
    else next.add(folderId);
    setFolderIds(next);

    postAssignment("/api/items/folders", wasSelected ? "DELETE" : "POST", {
      folderId,
      itemType,
      itemId,
    }).catch(() => setFolderIds(folderIds));
  }

  function toggleTag(tagId: string) {
    const wasSelected = tagIds.has(tagId);
    const next = new Set(tagIds);
    if (wasSelected) next.delete(tagId);
    else next.add(tagId);
    setTagIds(next);

    postAssignment("/api/items/tags", wasSelected ? "DELETE" : "POST", {
      tagId,
      itemType,
      itemId,
    }).catch(() => setTagIds(tagIds));
  }

  return (
    <div className="flex justify-end gap-1.5">
      <AssignmentPopover
        label="Folders"
        emptyLabel="No folders yet — create one on the Folders page."
        options={folders}
        selectedIds={folderIds}
        onToggle={toggleFolder}
        icon={FolderPlus}
        iconOnly={iconOnly}
      />
      <AssignmentPopover
        label="Tags"
        emptyLabel="No tags yet — create one on the Tags page."
        options={tags}
        selectedIds={tagIds}
        onToggle={toggleTag}
        icon={TagPlus}
        iconOnly={iconOnly}
      />
    </div>
  );
}
