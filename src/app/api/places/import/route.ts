import type { NextRequest } from "next/server";
import { z } from "zod";
import { AuthConfigurationError, checkOrigin, isAuthenticated, jsonResponse } from "@/lib/auth";
import { MapsLinkError } from "@/lib/maps-link";
import { resolveGoogleMapsLink } from "@/lib/resolve-maps-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();

export async function POST(request: NextRequest) {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    if (!await isAuthenticated(request)) return jsonResponse({ error: "가족 비밀번호로 다시 로그인해주세요." }, 401);
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return jsonResponse({ error: "Google 지도 공유 링크를 확인해주세요." }, 400);
    return jsonResponse({ place: await resolveGoogleMapsLink(input.data.url) });
  } catch (error) {
    if (error instanceof AuthConfigurationError) return jsonResponse({ error: error.message }, 503);
    if (error instanceof MapsLinkError) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ error: "장소를 불러오지 못했습니다. 링크를 확인하고 다시 시도해주세요." }, 503);
  }
}
