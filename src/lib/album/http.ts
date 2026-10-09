import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertAuthConfigured, AuthConfigurationError, checkOrigin, jsonResponse, SESSION_COOKIE, verifySession } from "../auth";
import { AlbumError } from "./store";
import { idSchema, revisionSchema } from "./model";
export const revisionBody = z.object({ revision: revisionSchema }).strict();
export type AlbumContext = { params: Promise<{ id: string }> };
export async function albumId(context: AlbumContext): Promise<string> { return idSchema.parse((await context.params).id); }
export async function albumBody(request: NextRequest): Promise<unknown> {
  if (Number(request.headers.get("Content-Length")) > 16384) throw new AlbumError("사진 정보가 너무 큽니다.", 413);
  const text = await request.text(); if (text.length > 16384) throw new AlbumError("사진 정보가 너무 큽니다.", 413);
  try { return JSON.parse(text); } catch { throw new AlbumError("사진 정보 형식을 확인해주세요.", 400); }
}
export async function albumResponse(request: NextRequest, mutation: boolean, action: () => Promise<unknown>) {
  if (mutation) { const failure = checkOrigin(request); if (failure) return failure; }
  try {
    assertAuthConfigured();
    if (!process.env.FAMILY_PASSWORD?.trim()) throw new AlbumError("가족사진 공유에는 가족 비밀번호와 서버 설정이 필요합니다.");
    if (!await verifySession(request.cookies.get(SESSION_COOKIE)?.value || "")) throw new AlbumError("가족 비밀번호로 로그인해주세요.", 401);
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new AlbumError("Supabase 사진 저장소 연결 설정이 필요합니다.");
    return jsonResponse(await action());
  } catch (error) {
    if (error instanceof AlbumError) return jsonResponse({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return jsonResponse({ error: "사진 정보와 위치를 확인해주세요." }, 400);
    if (error instanceof AuthConfigurationError) return jsonResponse({ error: error.message }, 503);
    return jsonResponse({ error: "사진 작업을 완료하지 못했습니다. 다시 시도해주세요." }, 503);
  }
}
