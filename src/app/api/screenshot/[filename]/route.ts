import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    // ✅ Next.js new behavior: params is async
    const { filename: rawFilename } = await context.params;

    const filename = path.basename(rawFilename); // ✅ prevent ../ attacks
    const filepath = path.join(process.cwd(), "playwright/screenshots", filename);

    const buffer = await fs.readFile(filepath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
  }
}
