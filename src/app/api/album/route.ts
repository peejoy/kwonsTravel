import type { NextRequest } from "next/server";
import { z } from "zod";
import { albumResponse, albumBody } from "@/lib/album/http";
import { photoMetadataSchema } from "@/lib/album/model";
import { listPhotos, reservePhoto } from "@/lib/album/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const bodySchema = z.object({ metadata: photoMetadataSchema }).strict();
export async function GET(request: NextRequest) { return albumResponse(request, false, () => listPhotos(request.nextUrl.searchParams.get("cursor"))); }
export async function POST(request: NextRequest) { return albumResponse(request, true, async () => reservePhoto(bodySchema.parse(await albumBody(request)).metadata)); }
