"use client";

import { ShieldCheck } from "@phosphor-icons/react";

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden">
      <div className="relative flex flex-col items-center gap-4 text-center z-10">
        <div className="flex items-center justify-center animate-pulse">
          <ShieldCheck size={42} weight="duotone" className="text-primary" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground select-none">
          Lumora
        </h2>
      </div>
    </div>
  );
}
