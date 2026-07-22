import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LibraryView } from "@/lib/library/types";

export function ViewToggle({ view }: { view: LibraryView }) {
  const tabs: { value: LibraryView; label: string }[] = [
    { value: "tracks", label: "Tracks" },
    { value: "albums", label: "Albums" },
  ];

  return (
    <div className="inline-flex rounded-md border p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={`?view=${tab.value}`}
          className={cn(
            "rounded px-3 py-1 text-sm font-medium transition-colors",
            view === tab.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
