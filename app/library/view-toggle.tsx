import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LibraryDisplay, LibraryView } from "@/lib/library/types";

export function ViewToggle({ view, display }: { view: LibraryView; display: LibraryDisplay }) {
  const tabs: { value: LibraryView; label: string }[] = [
    { value: "tracks", label: "Tracks" },
    { value: "albums", label: "Albums" },
  ];

  return (
    <div className="inline-flex gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={`?view=${tab.value}${display === "grid" ? "&display=grid" : ""}`}
          className={cn(
            "rounded-full px-4 py-1.5 font-heading text-sm font-bold transition-colors",
            view === tab.value
              ? "bg-white text-black"
              : "bg-white/10 text-white hover:bg-white/20",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
