import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSearchParams } from "@/lib/library/url";
import type { LibraryDisplay } from "@/lib/library/types";

const OPTIONS: { value: LibraryDisplay; label: string; icon: typeof List }[] = [
  { value: "list", label: "List view", icon: List },
  { value: "grid", label: "Grid view", icon: LayoutGrid },
];

export function DisplayToggle({
  display,
  searchParams,
}: {
  display: LibraryDisplay;
  searchParams: URLSearchParams;
}) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-white/10 p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = display === value;
        const href = `?${buildSearchParams(searchParams, { display: value === "list" ? undefined : value }).toString()}`;
        return (
          <Link
            key={value}
            href={href}
            aria-label={label}
            aria-current={active}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              active ? "bg-white text-black" : "text-muted-foreground hover:text-white",
            )}
          >
            <Icon className="size-4" />
          </Link>
        );
      })}
    </div>
  );
}
