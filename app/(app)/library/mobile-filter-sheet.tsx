"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { LibraryFilters } from "@/lib/library/types";
import { FilterFields, useFilterActions, type Folder, type Tag } from "./filter-sidebar";

export function MobileFilterSheet({
  filters,
  genres,
  labels,
  folders,
  tags,
}: {
  filters: LibraryFilters;
  genres: string[];
  labels: string[];
  folders: Folder[];
  tags: Tag[];
}) {
  const { apply, applyDebounced, router, pathname, searchParams } = useFilterActions();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="md:hidden">
            <SlidersHorizontal className="size-3.5" />
            Filters
          </Button>
        }
      />
      <SheetContent>
        <div className="flex items-center justify-between pr-8">
          <h2 className="text-xs font-bold tracking-wide text-white uppercase">Filters</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto rounded-full p-0 text-xs font-semibold text-muted-foreground hover:bg-transparent hover:text-white hover:underline"
            onClick={() => {
              const display = searchParams.get("display");
              router.push(`${pathname}?view=${filters.view}${display === "grid" ? "&display=grid" : ""}`);
            }}
          >
            Reset
          </Button>
        </div>
        <FilterFields
          filters={filters}
          genres={genres}
          labels={labels}
          folders={folders}
          tags={tags}
          apply={apply}
          applyDebounced={applyDebounced}
        />
      </SheetContent>
    </Sheet>
  );
}
