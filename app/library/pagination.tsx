import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { buildSearchParams } from "@/lib/library/url";

export function LibraryPagination({
  page,
  pageSize,
  total,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: URLSearchParams;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const prevHref = `?${buildSearchParams(searchParams, { page: Math.max(1, page - 1) }).toString()}`;
  const nextHref = `?${buildSearchParams(searchParams, { page: Math.min(totalPages, page + 1) }).toString()}`;

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {total === 0 ? "0 results" : `${total} results · page ${page} of ${totalPages}`}
      </span>
      <div className="flex gap-2">
        {hasPrev ? (
          <Link href={prevHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Previous
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {hasNext ? (
          <Link href={nextHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Next
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
