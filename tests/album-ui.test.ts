import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import AlbumView from "@/components/album/album-view";
import { uploadPrepared } from "@/lib/album/client";
import { emptyMetadata } from "@/lib/album/model";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("offers album upload separately from place registration", () => {
  const html = renderToStaticMarkup(createElement(AlbumView, { places: [], onAuthRequired: () => {} }));
  expect(html).toContain("여행 앨범"); expect(html).toContain("사진 올리기");
});
it("uploads normalized bytes directly and finalizes only after upload succeeds", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://album.example");
  const order: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    order.push(url);
    if (url === "/api/album") { expect(JSON.parse(String(init.body)).metadata.lat).toBeNull(); return Response.json({ id: "11111111-1111-4111-8111-111111111111", revision: 0, uploadUrl: "https://album.example/storage/v1/object/upload/sign/family-travel-photos/photo?token=test", uploadExpiresAt: "2099-01-01T00:00:00Z" }); }
    if (url.startsWith("https:")) { expect(init.body).toBeInstanceOf(Blob); return Response.json({}); }
    return Response.json({ photo: { id: "result" } });
  });
  expect((await uploadPrepared(new Blob(["jpeg"]), emptyMetadata)).id).toBe("result");
  expect(order).toHaveLength(3); expect(order[2]).toContain("/finalize");
});
it("rejects an upload permission to an unrelated host", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://album.example");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "11111111-1111-4111-8111-111111111111", revision: 0, uploadUrl: "https://evil.example/image", uploadExpiresAt: "2099-01-01T00:00:00Z" })));
  await expect(uploadPrepared(new Blob(["jpeg"]), emptyMetadata)).rejects.toThrow(/업로드/);
  expect(fetch).toHaveBeenCalledTimes(1);
});
