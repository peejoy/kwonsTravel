import type { NextRequest } from "next/server";
import { z } from "zod";
import { albumResponse, albumBody } from "@/lib/album/http";
import { cleanupPhotos } from "@/lib/album/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) { return albumResponse(request, true, async () => { z.object({}).strict().parse(await albumBody(request)); return cleanupPhotos(); }); }
