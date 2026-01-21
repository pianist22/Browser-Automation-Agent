export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { run } from "@openai/agents";
import { RateLimiterMemory } from "rate-limiter-flexible";
import {
  agent,
  cleanupBrowser,
  resetExecutionLog,
  getExecutionLog,
} from "@/lib/agent";



// 1 request per IP per 24 hours
const rateLimiter = new RateLimiterMemory({
  points: 1,
  duration: 24 * 60 * 60,
});

// ✅ best-effort IP extraction
function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  return "anonymous";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  try {
    await rateLimiter.consume(ip, 1);
  } 
  catch {
    return NextResponse.json(
      { error: "1 automation per day. Come back tomorrow!" },
      { status: 429 }
    );
  }

  // parse body safely
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const task = body?.task;
  if (!task || typeof task !== "string") {
    return NextResponse.json({ error: "Task is required" }, { status: 400 });
  }

  const sessionId = crypto.randomUUID();

  // ✅ reset log per request
  resetExecutionLog();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const result = await run(agent, task, { maxTurns: 12 });

        const executionLog = getExecutionLog();

        const screenshots = executionLog
          .filter((x) => x.toolName === "take_screenshot" && x.result?.screenshot)
          .map((x) => x.result.screenshot);

          // console.log("TASK RECEIVED:", task);
          // console.log("FINAL OUTPUT:", result.finalOutput);
          // console.log("TOOLS USED:", getExecutionLog().map(x => x.toolName));


        const payload = {
          sessionId,
          task,
          finalOutput: result.finalOutput ?? "Task completed",
          history: result.history ?? [],
          executionLog,
          screenshots,
        };

        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        controller.close();
      } catch (err: any) {
        const executionLog = getExecutionLog();

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              sessionId,
              task,
              error: err instanceof Error ? err.message : "Unknown error",
              executionLog,
            }) + "\n"
          )
        );

        controller.close();
      } finally {
        await cleanupBrowser().catch(console.error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Session-ID": sessionId,
    },
  });
}
