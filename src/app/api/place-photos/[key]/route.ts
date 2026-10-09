import type { NextRequest } from "next/server";
import { isAuthenticated, jsonResponse, AuthConfigurationError } from "@/lib/auth";
import { readStoredPhoto } from "@/lib/place-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  try {
    if (!await isAuthenticated(request)) return jsonResponse({ error: "가족 비밀번호로 로그인해주세요." }, 401);
    const photo = await readStoredPhoto((await context.params).key);
    if (!photo) return jsonResponse({ error: "저장된 사진이 없습니다." }, 404);
    return new Response(new Uint8Array(photo.bytes), { headers: { "Content-Type": photo.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch (error) {
    return jsonResponse({ error: error instanceof AuthConfigurationError ? error.message : "사진을 읽지 못했습니다." }, 503);
  }
}
