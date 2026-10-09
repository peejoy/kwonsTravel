import type { NextRequest } from "next/server";
import { z } from "zod";
import { albumResponse, albumBody, albumId, revisionBody, type AlbumContext } from "@/lib/album/http";
import { photoMetadataSchema, revisionSchema } from "@/lib/album/model";
import { getPhoto, updatePhoto, deletePhoto } from "@/lib/album/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const editSchema = z.object({ revision: revisionSchema, metadata: photoMetadataSchema }).strict();
export async function GET(request: NextRequest, context: AlbumContext) { return albumResponse(request, false, async () => ({ photo: await getPhoto(await albumId(context)) })); }
export async function PATCH(request: NextRequest, context: AlbumContext) { return albumResponse(request, true, async () => {
  const body = editSchema.parse(await albumBody(request)); return { photo: await updatePhoto(await albumId(context), body.revision, body.metadata) };
}); }
export async function DELETE(request: NextRequest, context: AlbumContext) { return albumResponse(request, true, async () => deletePhoto(await albumId(context), revisionBody.parse(await albumBody(request)).revision)); }
