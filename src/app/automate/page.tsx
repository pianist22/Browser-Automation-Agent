"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type ToolLogItem = {
  toolName: string;
  args: any;
  result?: any;
  error?: string;
  timestamp: string;
};

type AutomationResponse = {
  sessionId: string;
  task: string;
  finalOutput?: string;
  executionLog?: ToolLogItem[];
  screenshots?: string[];
  error?: string;
};

function prettyToolName(toolName: string) {
  return toolName
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toolBadge(tool: string) {
  if (tool.includes("open"))
    return "bg-blue-500/20 text-blue-200 ring-blue-400/30";
  if (tool.includes("type"))
    return "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30";
  if (tool.includes("click"))
    return "bg-amber-500/20 text-amber-200 ring-amber-400/30";
  if (tool.includes("screenshot"))
    return "bg-purple-500/20 text-purple-200 ring-purple-400/30";
  if (tool.includes("wait"))
    return "bg-pink-500/20 text-pink-200 ring-pink-400/30";
  return "bg-white/10 text-white/80 ring-white/10";
}

export default function AutomatePage() {
  const params = useSearchParams();
  const router = useRouter();

  const task = params.get("task") || "";

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AutomationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startedRef = useRef(false);

  useEffect(() => {
    if (!task.trim()) return;
    if (startedRef.current) return;

    startedRef.current = true;
    setLoading(true);

    // const alreadyUsed = localStorage.getItem("automation_used");
    // if (alreadyUsed) {
    //   alert("You already used your free automation today. Try again tomorrow!");
    //   setLoading(false);
    //   return;
    // }

    // localStorage.setItem("automation_used", "true");

    const run = async () => {
      try {
        const res = await fetch("/api/automate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.error || `Request failed (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream available");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const parsed: AutomationResponse = JSON.parse(trimmed);
            setData((prev) => ({ ...(prev || {}), ...parsed }));
          }
        }
      } catch (e: any) {
        setError(e.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [task]);

  const logs = useMemo(() => data?.executionLog || [], [data]);

  const screenshotEntries = useMemo(() => {
    const entries: { url: string; label: string }[] = [];
    for (const log of logs) {
      if (log?.result?.screenshot) {
        entries.push({
          url: log.result.screenshot,
          label: `After ${prettyToolName(log.toolName)}`,
        });
      }
    }
    return entries;
  }, [logs]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_40%),linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,0.92))] text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <button
              onClick={() => router.push("/")}
              className="text-sm text-white/60 hover:text-white transition"
            >
              ← Back
            </button>

            <h1 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight">
              Automation Run
            </h1>

            <p className="mt-2 text-sm text-white/60 max-w-3xl break-words">
              {task}
            </p>
          </div>

          <div className="text-left md:text-right min-w-0">
            <div className="text-xs text-white/50">Session</div>
            <div className="text-sm font-mono text-white/80 truncate max-w-[260px] md:max-w-none">
              {data?.sessionId || "—"}
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm text-white/60">Status</p>
              <div className="mt-1 flex items-center gap-3">
                {loading ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                    <span className="text-white/90 font-medium">Running…</span>
                  </>
                ) : error ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <span className="text-red-200 font-medium">Failed</span>
                  </>
                ) : (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <span className="text-emerald-200 font-medium">
                      Completed
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="text-sm text-white/60">
              Tools executed:{" "}
              <span className="text-white/90 font-medium">{logs.length}</span>
            </div>
          </div>

          {/* Final Output */}
          <div className="mt-5">
            <p className="text-sm text-white/60">Final Output</p>
            <div className="mt-2 rounded-2xl bg-black/30 ring-1 ring-white/10 p-4 text-white/90 whitespace-pre-wrap break-words overflow-x-auto">
              {error
                ? error
                : data?.finalOutput || (loading ? "Waiting for result…" : "—")}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-10 grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Tool Timeline */}
          <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 md:p-6 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tool Timeline</h2>
              <span className="text-xs text-white/50">streaming updates</span>
            </div>

            <div className="mt-5 space-y-4">
              {logs.length === 0 ? (
                <div className="text-sm text-white/50">
                  {loading ? "Listening to events…" : "No steps logged yet."}
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ring-1 ${toolBadge(
                            log.toolName
                          )}`}
                        >
                          {prettyToolName(log.toolName)}
                        </span>
                        <span className="text-xs text-white/40">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {log.error ? (
                        <span className="text-xs text-red-300">error</span>
                      ) : log.result ? (
                        <span className="text-xs text-emerald-300">ok</span>
                      ) : (
                        <span className="text-xs text-white/40">pending</span>
                      )}
                    </div>

                    <div className="mt-3 text-xs text-white/60 break-words overflow-x-auto">
                      <span className="text-white/40">args:</span>{" "}
                      <span className="font-mono break-words">
                        {JSON.stringify(log.args || {}, null, 0)}
                      </span>
                    </div>

                    <div className="mt-2 text-xs">
                      {log.error ? (
                        <div className="text-red-200 font-mono whitespace-pre-wrap break-words overflow-x-auto">
                          {log.error}
                        </div>
                      ) : log.result ? (
                        <div className="text-white/70 font-mono whitespace-pre-wrap break-words overflow-x-auto max-w-full">
                          {JSON.stringify(log.result, null, 2)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Screenshots */}
          <section className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 md:p-6 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Screenshots</h2>
              <span className="text-xs text-white/50">
                {screenshotEntries.length} captured
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {screenshotEntries.length === 0 ? (
                <div className="text-sm text-white/50">
                  {loading ? "Waiting for screenshots…" : "No screenshots found."}
                </div>
              ) : (
                screenshotEntries.map((s, idx) => (
                  <ScreenshotCard key={idx} url={s.url} label={s.label} />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function ScreenshotCard({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-2xl bg-black/25 ring-1 ring-white/10 p-4 flex flex-col gap-3 min-w-0">
        <div className="text-sm font-medium break-words">{label}</div>

        <div className="aspect-video overflow-hidden rounded-xl ring-1 ring-white/10 bg-black/40">
          <img
            src={url}
            alt={label}
            className="h-full w-full object-cover opacity-90"
            loading="lazy"
          />
        </div>

        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold hover:opacity-95 transition"
        >
          View Screenshot
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-w-5xl w-full rounded-3xl bg-black ring-1 ring-white/10 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-2">
              <div className="text-sm text-white/80 break-words">{label}</div>
              <button
                className="text-sm text-white/60 hover:text-white"
                onClick={() => setOpen(false)}
              >
                Close ✕
              </button>
            </div>

            <div className="rounded-2xl overflow-auto max-h-[75vh] ring-1 ring-white/10 bg-black/60">
              <img src={url} alt={label} className="w-full h-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
