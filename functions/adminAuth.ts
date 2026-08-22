// ═══════════════════════════════════════════════════════════════
// adminAuth — NABA QURAN Admin Panel Authentication
// ═══════════════════════════════════════════════════════════════
// Author: Elara (Senior Engineer) for Safa Glass
// Created: 2026-08-22
// Purpose: Server-side admin password verification
//
// Takes: { password: string }
// Returns: { authorized: boolean, token: string|null }
//
// Requires env variable: ADMIN_PASSWORD
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers });

  try {
    const body = await req.json();
    const password = (body.password || "").trim();

    if (!password) {
      return new Response(JSON.stringify({
        authorized: false,
        error: "Password required"
      }), { headers });
    }

    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) {
      console.error("ADMIN_PASSWORD env var not set");
      return new Response(JSON.stringify({
        authorized: false,
        error: "Server configuration error"
      }), { headers });
    }

    if (password === adminPassword) {
      // Generate a simple session token (timestamp + random)
      const token = btoa(Date.now().toString(36) + Math.random().toString(36).slice(2));
      return new Response(JSON.stringify({
        authorized: true,
        token: token
      }), { headers });
    }

    return new Response(JSON.stringify({
      authorized: false,
      error: "Invalid password"
    }), { headers });

  } catch (e) {
    console.error("adminAuth error:", e);
    return new Response(JSON.stringify({
      authorized: false,
      error: "Server error"
    }), { headers });
  }
});