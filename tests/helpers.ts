import type { APIRequestContext } from "@playwright/test";

export interface TagFixture {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export async function createTag(
  request: APIRequestContext,
  name: string,
  color?: string,
): Promise<TagFixture> {
  const response = await request.post("/api/tags", {
    data: { name, ...(color === undefined ? {} : { color }) },
  });
  if (!response.ok()) {
    throw new Error(`Tag fixture creation failed: ${response.status()}`);
  }
  return (await response.json()) as TagFixture;
}
