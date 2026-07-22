"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RenameFolderForm({ folderId, initialName }: { folderId: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === initialName) return;
    setPending(true);
    try {
      await fetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs text-lg font-semibold" />
      <Button type="submit" size="sm" variant="outline" disabled={pending || !name.trim() || name === initialName}>
        Rename
      </Button>
    </form>
  );
}
