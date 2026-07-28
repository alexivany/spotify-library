"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, FolderClosed, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/library", label: "Your Library", icon: Library },
  { href: "/folders", label: "Folders", icon: FolderClosed },
  { href: "/tags", label: "Tags", icon: Tag },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 bg-sidebar p-2">
      <div className="rounded-lg bg-[#121212] px-4 py-4">
        <Link href="/library" className="flex items-center gap-2 text-white">
          <svg viewBox="0 0 24 24" className="size-8 shrink-0 fill-primary">
            <circle cx="12" cy="12" r="12" />
            <path
              d="M17.5 16.2c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.9-9.3-1a.65.65 0 0 1-.3-1.3c4-.9 7.5-.5 10.3 1.2.3.2.4.6.2.9zm1.2-2.7c-.3.4-.8.5-1.1.3-2.9-1.8-7.3-2.3-10.7-1.2a.8.8 0 1 1-.5-1.5c3.9-1.2 8.7-.6 12 1.4.4.2.5.7.3 1zm.1-2.8c-3.4-2-9.2-2.2-12.5-1.2a.95.95 0 1 1-.6-1.8c3.8-1.2 10.1-.9 14 1.4a.95.95 0 1 1-1 1.6z"
              fill="var(--sidebar)"
            />
          </svg>
          <span className="font-heading text-sm font-bold tracking-tight">Library Manager</span>
        </Link>
      </div>

      <nav className="flex flex-col gap-1 rounded-lg bg-[#121212] p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-4 rounded-md px-3 py-2.5 font-heading text-sm font-bold transition-colors hover:text-white",
                active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
