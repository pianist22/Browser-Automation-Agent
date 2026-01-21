"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [task, setTask] = useState("");

  const canSubmit = useMemo(() => task.trim().length > 5, [task]);

function handleSubmit() {
  const trimmed = task.trim();
  if (!trimmed) return;
  router.push(`/automate?task=${encodeURIComponent(trimmed)}`);
}

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_40%),linear-gradient(to_bottom,rgba(0,0,0,0.25),rgba(0,0,0,0.85))] text-white">
      <div className="mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 ring-1 ring-white/10 flex items-center justify-center">
              <span className="text-lg font-bold">⚡</span>
            </div>
            <div>
              <p className="text-sm text-white/60">Stage-1</p>
              <h1 className="text-xl font-semibold tracking-tight">
                Browser Automation Agent
              </h1>
            </div>
          </div>

          <div className="hidden md:block text-sm text-white/60">
            Powered by Playwright + OpenAI Agents
          </div>
        </div>

        {/* Hero */}
        <div className="mt-14">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
            Automate websites <span className="text-white/60">using plain English</span>
          </h2>
          <p className="mt-4 max-w-2xl text-white/70 text-base md:text-lg">
            Describe a task and watch the agent execute it step-by-step, capturing screenshots
            and tool logs in real-time.
          </p>
        </div>

        {/* Prompt Box */}
        <div className="mt-10 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 md:p-6 shadow-[0_0_80px_rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/60">
              Enter your automation task
            </p>
            <span className="text-xs text-white/40">
              Example: “Go to ui.chaicode.com and open Auth Sada → Sign Up”
            </span>
          </div>

          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder={`Try:\nGo to https://ui.chaicode.com\nClick Auth Sada\nClick Sign Up\nType 'Priyanshu' in field 'Enter your full name'\nClick 'Create Account'`}
            className="mt-4 w-full min-h-35 resize-none rounded-2xl bg-black/30 ring-1 ring-white/10 px-4 py-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
          />

          <div className="mt-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-2xl bg-white text-black px-5 py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 transition"
            >
              Automate Task →
            </button>

            <div className="text-sm text-white/50">
              Stage-1: 1 run/day/IP (server enforced)
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-xs text-white/40">
          ⚠️ Some sites may show CAPTCHA. The agent will pause for manual verification.
        </div>
      </div>
    </main>
  );
}
