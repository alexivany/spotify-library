"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteTagButton({ tagId }: { tagId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this tag? It will be removed from every item it's applied to.")) return;
    setPending(true);
    try {
      await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
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
