"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RemoveFromFolderButton({
  folderId,
  itemType,
  itemId,
}: {
  folderId: string;
  itemType: "track" | "album";
  itemId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    setPending(true);
    try {
      await fetch("/api/items/folders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, itemType, itemId }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleRemove} disabled={pending}>
      Remove
    </Button>
  );
}
