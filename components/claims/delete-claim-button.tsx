"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteClaim } from "@/app/actions/delete-claim";

export function DeleteClaimButton({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm("Permanently delete this claim and its evidence? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteClaim(claimId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/dashboard/claims");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={pending}
        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="mr-1.5 size-4" aria-hidden />
        {pending ? "Deleting…" : "Delete claim"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
