import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !publicKey || !serviceRoleKey) {
      return json({ error: "Server configuration is incomplete" }, 500);
    }

    const callerClient = createClient(supabaseUrl, publicKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return json({ error: "Only the house admin can create accounts" }, 403);
    }

    const body = await req.json();
    const displayName = String(body.displayName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!displayName || displayName.length > 80) return json({ error: "Enter a valid name" }, 400);
    if (!email.includes("@")) return json({ error: "Enter a valid email address" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName }
    });

    if (error) return json({ error: error.message }, 400);
    return json({ id: data.user.id, email: data.user.email });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
