// Edge Function: notify
// Replaces direct client INSERT into public.notifications.
//
// - JWT is verified by the platform (verify_jwt = true).
// - Caller (from_user_id) is taken from the JWT, NEVER from the request body.
// - Before inserting, we verify that the action actually happened
//   (matching row in friendships / likes / comments / reposts).
// - Insert runs via service-role client, so RLS does not need to allow
//   client INSERTs anymore.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const VALID_TYPES = new Set(["like", "comment", "repost", "follow"]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing_auth" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "invalid_jwt" }, 401);
  const fromUserId = userData.user.id;

  let body: { to_user_id?: string; type?: string; post_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const toUserId = body.to_user_id;
  const type = body.type;
  const postId = body.post_id ?? null;

  if (!toUserId || !type || !VALID_TYPES.has(type)) {
    return json({ error: "invalid_input" }, 400);
  }
  if (toUserId === fromUserId) return json({ ok: true, skipped: "self" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let justified = false;

  if (type === "follow") {
    const { count } = await admin
      .from("friendships")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", fromUserId)
      .eq("friend_id", toUserId);
    justified = (count ?? 0) > 0;
  } else {
    if (!postId) return json({ error: "missing_post_id" }, 400);
    const table =
      type === "like" ? "likes" : type === "comment" ? "comments" : "reposts";
    const { count } = await admin
      .from(table)
      .select("id", { head: true, count: "exact" })
      .eq("user_id", fromUserId)
      .eq("post_id", postId);
    justified = (count ?? 0) > 0;
  }

  if (!justified) return json({ error: "no_justifying_row" }, 403);

  const { error: insErr } = await admin.from("notifications").insert({
    user_id: toUserId,
    from_user_id: fromUserId,
    type,
    post_id: postId,
    read: false,
  });
  if (insErr) {
    return json({ error: "insert_failed", detail: insErr.message }, 500);
  }

  return json({ ok: true });
});
