import Link from "next/link";
import { Grid2x2, Grid3x3, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSearchParams } from "@/lib/library/url";
import type { GridCardSize } from "@/lib/library/types";

const OPTIONS: { value: GridCardSize; label: string; icon: typeof Grid2x2 }[] = [
  { value: "large", label: "Large cards", icon: Grid2x2 },
  { value: "medium", label: "Medium cards", icon: LayoutGrid },
  { value: "small", label: "Small cards", icon: Grid3x3 },
];

export function CardSizeToggle({
  cardSize,
  searchParams,
}: {
  cardSize: GridCardSize;
  searchParams: URLSearchParams;
}) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-white/10 p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = cardSize === value;
        const href = `?${buildSearchParams(searchParams, { cardSize: value === "medium" ? undefined : value }).toString()}`;
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
