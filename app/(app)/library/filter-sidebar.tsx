"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ALBUM_TYPES, SORT_OPTIONS, type LibraryFilters } from "@/lib/library/types";
import { buildSearchParams, type SearchParamsPatch } from "@/lib/library/url";

export interface Folder {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
}

const ANY_VALUE = "__any__";

const EXPLICIT_LABELS: Record<string, string> = {
  [ANY_VALUE]: "Any",
  true: "Explicit only",
  false: "Clean only",
};

function toggleListValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function minutesToMs(minutes: string): number | undefined {
  if (!minutes) return undefined;
  const n = Number(minutes);
  return Number.isFinite(n) ? Math.round(n * 60_000) : undefined;
}

export function useFilterActions() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback(
    (patch: SearchParamsPatch) => {
      const next = buildSearchParams(searchParams, { ...patch, page: undefined });
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const applyDebounced = useCallback(
    (patch: SearchParamsPatch) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => apply(patch), 350);
    },
    [apply],
  );

  return { apply, applyDebounced, router, pathname, searchParams };
}

export function FilterFields({
  filters,
  genres,
  labels,
  folders,
  tags,
  apply,
  applyDebounced,
}: {
  filters: LibraryFilters;
  genres: string[];
  labels: string[];
  folders: Folder[];
  tags: Tag[];
  apply: (patch: SearchParamsPatch) => void;
  applyDebounced: (patch: SearchParamsPatch) => void;
}) {
  const folderNames = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const tagNames = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const sortLabels = useMemo(
    () => new Map<string, string>(SORT_OPTIONS.map((o) => [o.value, o.label])),
    [],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="search">Search</Label>
        <Input
          id="search"
          key={filters.q ?? ""}
          defaultValue={filters.q ?? ""}
          placeholder="Track, album, or artist…"
          className="rounded-full bg-white/10 pl-3.5"
          onChange={(e) => applyDebounced({ q: e.target.value || undefined })}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Sort by</Label>
        <Select value={filters.sort} onValueChange={(value) => apply({ sort: value })}>
          <SelectTrigger className="w-full">
            <SelectValue>{(value: string) => sortLabels.get(value) ?? value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Content type</Label>
        <div className="space-y-1.5">
          {ALBUM_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox
                checked={filters.albumTypes.includes(type)}
                onCheckedChange={() => apply({ albumType: toggleListValue(filters.albumTypes, type) })}
              />
              {type}
            </label>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Genre</Label>
        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {genres.length === 0 && <p className="text-xs text-muted-foreground">No genres yet</p>}
          {genres.map((genre) => (
            <label key={genre} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox
                checked={filters.genres.includes(genre)}
                onCheckedChange={() => apply({ genre: toggleListValue(filters.genres, genre) })}
              />
              {genre}
            </label>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="label">Record label</Label>
        <Input
          id="label"
          key={filters.label ?? ""}
          defaultValue={filters.label ?? ""}
          placeholder="e.g. Warp Records"
          list="label-options"
          onChange={(e) => applyDebounced({ label: e.target.value || undefined })}
        />
        <datalist id="label-options">
          {labels.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Release date</Label>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            key={filters.releaseFrom ?? "releaseFrom"}
            defaultValue={filters.releaseFrom ?? ""}
            onChange={(e) => apply({ releaseFrom: e.target.value || undefined })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            key={filters.releaseTo ?? "releaseTo"}
            defaultValue={filters.releaseTo ?? ""}
            onChange={(e) => apply({ releaseTo: e.target.value || undefined })}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Saved date</Label>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            key={filters.savedFrom ?? "savedFrom"}
            defaultValue={filters.savedFrom ?? ""}
            onChange={(e) => apply({ savedFrom: e.target.value || undefined })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            key={filters.savedTo ?? "savedTo"}
            defaultValue={filters.savedTo ?? ""}
            onChange={(e) => apply({ savedTo: e.target.value || undefined })}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Popularity</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Min"
            key={filters.popularityMin ?? "popMin"}
            defaultValue={filters.popularityMin ?? ""}
            onChange={(e) => applyDebounced({ popularityMin: e.target.value || undefined })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Max"
            key={filters.popularityMax ?? "popMax"}
            defaultValue={filters.popularityMax ?? ""}
            onChange={(e) => applyDebounced({ popularityMax: e.target.value || undefined })}
          />
        </div>
      </div>

      {filters.view === "tracks" && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step="0.5"
                placeholder="Min"
                key={filters.durationMinMs ?? "durMin"}
                defaultValue={filters.durationMinMs ? filters.durationMinMs / 60_000 : ""}
                onChange={(e) => applyDebounced({ durationMinMs: minutesToMs(e.target.value) })}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="number"
                min={0}
                step="0.5"
                placeholder="Max"
                key={filters.durationMaxMs ?? "durMax"}
                defaultValue={filters.durationMaxMs ? filters.durationMaxMs / 60_000 : ""}
                onChange={(e) => applyDebounced({ durationMaxMs: minutesToMs(e.target.value) })}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Explicit</Label>
            <Select
              value={filters.explicit === undefined ? ANY_VALUE : String(filters.explicit)}
              onValueChange={(value) => apply({ explicit: value === ANY_VALUE ? undefined : value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(value: string) => EXPLICIT_LABELS[value] ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_VALUE}>Any</SelectItem>
                <SelectItem value="true">Explicit only</SelectItem>
                <SelectItem value="false">Clean only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <Separator />

      <div className="space-y-2">
        <Label>Folder</Label>
        <Select
          value={filters.folderId ?? ANY_VALUE}
          onValueChange={(value) => apply({ folder: value === ANY_VALUE ? undefined : value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: string) => (value === ANY_VALUE ? "Any folder" : (folderNames.get(value) ?? value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>Any folder</SelectItem>
            {folders.map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>
                {folder.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tag</Label>
        <Select
          value={filters.tagId ?? ANY_VALUE}
          onValueChange={(value) => apply({ tag: value === ANY_VALUE ? undefined : value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: string) => (value === ANY_VALUE ? "Any tag" : (tagNames.get(value) ?? value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>Any tag</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function LibraryFilterSidebar({
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
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="w-14">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand filters"
          className="flex w-full flex-col items-center gap-2 rounded-lg bg-card/60 py-4 text-muted-foreground transition-colors hover:text-white"
        >
          <SlidersHorizontal className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 space-y-6 rounded-lg bg-card/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wide text-white uppercase">Filters</h2>
        <div className="flex items-center gap-3">
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
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse filters"
            className="text-muted-foreground transition-colors hover:text-white"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>
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
    </div>
  );
}
