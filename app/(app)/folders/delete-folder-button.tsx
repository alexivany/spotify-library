"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteFolderButton({ folderId }: { folderId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this folder? Items stay in your library but are removed from the folder.")) return;
    setPending(true);
    try {
      await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} disabled={pending}>
      Delete
    </Button>
  );
}
