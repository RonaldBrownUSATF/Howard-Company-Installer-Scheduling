import { z } from "zod";
import { invalid, ok, readJson } from "@/lib/http";
import { sendInvite } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const Body = z.object({
  emails: z.array(z.string().trim().toLowerCase().email()).min(1, "Add at least one email address").max(50),
  message: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const s = await getSettings();
  const unique = [...new Set(parsed.data.emails)];
  const results = await Promise.all(unique.map((e) => sendInvite(e, s, parsed.data.message)));
  return ok({ sent: unique.filter((_, i) => results[i]), failed: unique.filter((_, i) => !results[i]) });
}
