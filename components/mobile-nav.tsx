"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FolderClosed, Library, Menu, Tag as TagIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type Folder = Pick<Tables<"folders">, "id" | "name">;
type Tag = Pick<Tables<"tags">, "id" | "name">;

interface NavSection {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  items: (Folder | Tag)[];
  itemHref: (item: Folder | Tag) => string;
}

export function MobileNav({ folders, tags }: { folders: Folder[]; tags: Tag[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sections: NavSection[] = [
    {
      key: "folders",
      href: "/folders",
      label: "Folders",
      icon: FolderClosed,
      items: folders,
      itemHref: (folder) => `/folders/${folder.id}`,
    },
    {
      key: "tags",
      href: "/tags",
      label: "Tags",
      icon: TagIcon,
      items: tags,
      itemHref: (tag) => `/library?tag=${tag.id}`,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu />
          </Button>
        }
      />
      <SheetContent className="bg-sidebar text-sidebar-foreground ring-0" showCloseButton>
        <Link
          href="/library"
          onClick={() => setOpen(false)}
          className="mb-2 flex items-center gap-2 pr-8 text-white"
        >
          <svg viewBox="0 0 24 24" className="size-8 shrink-0 fill-primary">
            <circle cx="12" cy="12" r="12" />
            <path
              d="M17.5 16.2c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.9-9.3-1a.65.65 0 0 1-.3-1.3c4-.9 7.5-.5 10.3 1.2.3.2.4.6.2.9zm1.2-2.7c-.3.4-.8.5-1.1.3-2.9-1.8-7.3-2.3-10.7-1.2a.8.8 0 1 1-.5-1.5c3.9-1.2 8.7-.6 12 1.4.4.2.5.7.3 1zm.1-2.8c-3.4-2-9.2-2.2-12.5-1.2a.95.95 0 1 1-.6-1.8c3.8-1.2 10.1-.9 14 1.4a.95.95 0 1 1-1 1.6z"
              fill="var(--sidebar)"
            />
          </svg>
          <span className="font-heading text-sm font-bold tracking-tight">Library Manager</span>
        </Link>

        <nav className="flex flex-col gap-1">
          <Link
            href="/library"
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-4 rounded-md px-3 py-2.5 font-heading text-sm font-bold transition-colors hover:text-white",
              pathname === "/library" ? "bg-sidebar-accent text-white" : "text-sidebar-foreground",
            )}
          >
            <Library className="size-5 shrink-0" strokeWidth={pathname === "/library" ? 2.5 : 2} />
            Your Library
          </Link>

          {sections.map((section) => {
            const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
            const Icon = section.icon;
            return (
              <div key={section.key}>
                <Link
                  href={section.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-4 rounded-md px-3 py-2.5 font-heading text-sm font-bold transition-colors hover:text-white",
                    active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                  {section.label}
                </Link>
                {section.items.length > 0 && (
                  <div className="mt-1 ml-4 flex flex-col gap-0.5 border-l border-white/10 py-0.5 pl-4">
                    {section.items.map((item) => (
                      <Link
                        key={item.id}
                        href={section.itemHref(item)}
                        onClick={() => setOpen(false)}
                        className="truncate rounded-md px-2 py-1 text-xs font-medium text-sidebar-foreground transition-colors hover:text-white"
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
