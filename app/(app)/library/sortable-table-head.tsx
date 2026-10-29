import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortKey, SortOption } from "@/lib/library/types";
import { buildSearchParams } from "@/lib/library/url";
import { cn } from "@/lib/utils";

export function SortableTableHead({
  label,
  sortKey,
  sort,
  searchParams,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortOption;
  searchParams: URLSearchParams;
  className?: string;
}) {
  const ascending = sort === `${sortKey}-asc`;
  const active = ascending || sort === `${sortKey}-desc`;
  const nextDirection = ascending ? "desc" : "asc";
  const Icon = active ? (ascending ? ArrowUp : ArrowDown) : ArrowUpDown;
  const href = `?${buildSearchParams(searchParams, {
    sort: `${sortKey}-${nextDirection}`,
    page: undefined,
  })}`;

  return (
    <TableHead
      className={className}
      scope="col"
      aria-sort={active ? (ascending ? "ascending" : "descending") : undefined}
    >
      <Link
        href={href}
        scroll={false}
        aria-label={`Sort by ${label.toLowerCase()} ${nextDirection === "asc" ? "ascending" : "descending"}`}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-sm transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active && "text-primary",
        )}
      >
        {label}
        <Icon className={cn("size-3.5 shrink-0", !active && "opacity-50")} aria-hidden="true" />
      </Link>
    </TableHead>
  );
}
