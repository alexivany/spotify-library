"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateTagForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (res.ok) {
        setName("");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-9 w-9 shrink-0 cursor-pointer rounded border"
        aria-label="Tag color"
      />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" />
      <Button type="submit" disabled={pending || !name.trim()}>
        Create
      </Button>
    </form>
  );
}
