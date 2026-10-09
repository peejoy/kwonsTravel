import type { NextRequest } from "next/server";
import { albumResponse, albumBody, albumId, revisionBody, type AlbumContext } from "@/lib/album/http";
import { renewUpload } from "@/lib/album/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: AlbumContext) { return albumResponse(request, true, async () => renewUpload(await albumId(context), revisionBody.parse(await albumBody(request)).revision)); }
