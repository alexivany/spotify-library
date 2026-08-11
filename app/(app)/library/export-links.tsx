import { buttonVariants } from "@/components/ui/button";
import { buildSearchParams } from "@/lib/library/url";
import type { LibraryView } from "@/lib/library/types";

export function ExportLinks({ view, searchParams }: { view: LibraryView; searchParams: URLSearchParams }) {
  const filteredHref = `/api/export?${buildSearchParams(searchParams, { view }).toString()}`;
  const allHref = `/api/export?${new URLSearchParams({ view, all: "true" }).toString()}`;

  return (
    <div className="flex gap-2">
      <a href={filteredHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Export filtered CSV
      </a>
      <a href={allHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Export all CSV
      </a>
    </div>
  );
}
