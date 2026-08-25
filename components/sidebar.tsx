"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, FolderClosed, Library, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/supabase/types";
import { LIBRARY_ITEM_MIME, type LibraryItemDragPayload } from "@/lib/library/drag";

type Folder = Pick<Tables<"folders">, "id" | "name">;
type Tag = Pick<Tables<"tags">, "id" | "name">;

interface NavSection {
  key: string;
  href: string;
  label: string;
  icon: typeof FolderClosed;
  items: (Folder | Tag)[];
  itemHref: (item: Folder | Tag) => string;
  dropUrl: string;
  dropKey: "folderId" | "tagId";
}

function isLibraryItemDrag(e: React.DragEvent) {
  return e.dataTransfer.types.includes(LIBRARY_ITEM_MIME);
}

export function Sidebar({ folders, tags }: { folders: Folder[]; tags: Tag[] }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function expand(key: string) {
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  async function handleDrop(e: React.DragEvent, section: NavSection, targetId: string, targetKey: string) {
    e.preventDefault();
    setDragOverTarget(null);
    const raw = e.dataTransfer.getData(LIBRARY_ITEM_MIME);
    if (!raw) return;
    const payload = JSON.parse(raw) as LibraryItemDragPayload;

    await fetch(section.dropUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [section.dropKey]: targetId, itemType: payload.itemType, itemId: payload.itemId }),
    }).catch(() => null);

    setJustAdded(targetKey);
    setTimeout(() => setJustAdded((current) => (current === targetKey ? null : current)), 1200);
  }

  const sections: NavSection[] = [
    {
      key: "folders",
      href: "/folders",
      label: "Folders",
      icon: FolderClosed,
      items: folders,
      itemHref: (folder) => `/folders/${folder.id}`,
      dropUrl: "/api/items/folders",
      dropKey: "folderId",
    },
    {
      key: "tags",
      href: "/tags",
      label: "Tags",
      icon: TagIcon,
      items: tags,
      itemHref: (tag) => `/library?tag=${tag.id}`,
      dropUrl: "/api/items/tags",
      dropKey: "tagId",
    },
  ];

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col gap-2 bg-sidebar p-2 transition-[width] duration-150",
        collapsed ? "w-18" : "w-60",
      )}
    >
      <div className="rounded-lg bg-[#121212] px-4 py-4">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
          <Link href="/library" className="flex items-center gap-2 text-white" title={collapsed ? "Library Manager" : undefined}>
            <svg viewBox="0 0 24 24" className="size-8 shrink-0 fill-primary">
              <circle cx="12" cy="12" r="12" />
              <path
                d="M17.5 16.2c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.9-9.3-1a.65.65 0 0 1-.3-1.3c4-.9 7.5-.5 10.3 1.2.3.2.4.6.2.9zm1.2-2.7c-.3.4-.8.5-1.1.3-2.9-1.8-7.3-2.3-10.7-1.2a.8.8 0 1 1-.5-1.5c3.9-1.2 8.7-.6 12 1.4.4.2.5.7.3 1zm.1-2.8c-3.4-2-9.2-2.2-12.5-1.2a.95.95 0 1 1-.6-1.8c3.8-1.2 10.1-.9 14 1.4a.95.95 0 1 1-1 1.6z"
                fill="var(--sidebar)"
              />
            </svg>
            {!collapsed && <span className="font-heading text-sm font-bold tracking-tight">Library Manager</span>}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="shrink-0 rounded-md p-1 text-sidebar-foreground transition-colors hover:text-white"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="flex items-center justify-center rounded-lg bg-[#121212] py-2 text-sidebar-foreground transition-colors hover:text-white"
        >
          <ChevronRight className="size-4" />
        </button>
      )}

      <nav className="flex flex-col gap-1 rounded-lg bg-[#121212] p-2">
        <Link
          href="/library"
          title={collapsed ? "Your Library" : undefined}
          className={cn(
            "flex items-center rounded-md font-heading text-sm font-bold transition-colors hover:text-white",
            collapsed ? "justify-center px-0 py-2.5" : "gap-4 px-3 py-2.5",
            pathname === "/library" ? "bg-sidebar-accent text-white" : "text-sidebar-foreground",
          )}
        >
          <Library className="size-5 shrink-0" strokeWidth={pathname === "/library" ? 2.5 : 2} />
          {!collapsed && "Your Library"}
        </Link>

        {sections.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          const isExpanded = expanded.has(section.key);
          const Icon = section.icon;
          return (
            <div key={section.key}>
              <div
                className="flex items-center"
                onDragEnter={(e) => {
                  if (isLibraryItemDrag(e)) expand(section.key);
                }}
              >
                <Link
                  href={section.href}
                  title={collapsed ? section.label : undefined}
                  className={cn(
                    "flex flex-1 items-center rounded-md font-heading text-sm font-bold transition-colors hover:text-white",
                    collapsed ? "justify-center px-0 py-2.5" : "gap-4 px-3 py-2.5",
                    active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                  {!collapsed && section.label}
                </Link>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggle(section.key)}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${section.label}`}
                    aria-expanded={isExpanded}
                    className="rounded-md p-2 text-sidebar-foreground transition-colors hover:text-white"
                  >
                    <ChevronRight className={cn("size-4 transition-transform", isExpanded && "rotate-90")} />
                  </button>
                )}
              </div>
              {!collapsed && isExpanded && (
                <div className="mt-1 ml-4 flex flex-col gap-0.5 border-l border-white/10 py-0.5 pl-4">
                  {section.items.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">Nothing yet</p>
                  ) : (
                    section.items.map((item) => {
                      const targetKey = `${section.key}:${item.id}`;
                      return (
                        <Link
                          key={item.id}
                          href={section.itemHref(item)}
                          onDragOver={(e) => {
                            if (!isLibraryItemDrag(e)) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "copy";
                            if (dragOverTarget !== targetKey) setDragOverTarget(targetKey);
                          }}
                          onDragLeave={() => {
                            setDragOverTarget((current) => (current === targetKey ? null : current));
                          }}
                          onDrop={(e) => handleDrop(e, section, item.id, targetKey)}
                          className={cn(
                            "truncate rounded-md px-2 py-1 text-xs font-medium text-sidebar-foreground transition-colors hover:text-white",
                            dragOverTarget === targetKey && "bg-primary/20 text-white ring-1 ring-primary",
                            justAdded === targetKey && "bg-emerald-500/20 text-white",
                          )}
                        >
                          {item.name}
                        </Link>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
