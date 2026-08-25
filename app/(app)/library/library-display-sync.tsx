"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const DISPLAY_STORAGE_KEY = "library-display";

export function LibraryDisplaySync() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.has("display")) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(DISPLAY_STORAGE_KEY);
    } catch {
      return;
    }
    if (stored === "grid") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("display", "grid");
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);

  return null;
}
