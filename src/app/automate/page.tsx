// app/automate/page.tsx
import { Suspense } from "react";
import AutomateClient from "./AutomateClient";

export const dynamic = "force-dynamic"; // IMPORTANT for Vercel
export const revalidate = 0;


export default function AutomatePage() {
  return (
    <Suspense fallback={<AutomateLoading />}>
      <AutomateClient />
    </Suspense>
  );
}

function AutomateLoading() {
  return (
    <main className="min-h-screen flex items-center justify-center text-white">
      <div className="text-white/70">Preparing automation…</div>
    </main>
  );
}
