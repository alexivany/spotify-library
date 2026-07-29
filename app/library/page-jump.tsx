"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { buildSearchParams } from "@/lib/library/url";

export function PageJump({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(String(page));

  function go() {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setValue(String(page));
      return;
    }
    const clamped = Math.min(totalPages, Math.max(1, Math.round(n)));
    setValue(String(clamped));
    const next = buildSearchParams(searchParams, { page: clamped });
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="flex items-center gap-1.5"
    >
      <span>page</span>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={go}
        className="h-7 w-14 text-center"
        aria-label="Go to page"
      />
      <span>of {totalPages}</span>
    </form>
  );
}
