// ═══════════════════════════════════════════════════════════════
// islamicAiProxy — NABA QURAN Islamic AI Guide Proxy
// ═══════════════════════════════════════════════════════════════
// Author: Elara (Senior Engineer) for Safa Glass
// Created: 2026-08-22
// Purpose: Proxy between client and LLM for Islamic Q&A + Tajweed analysis
//
// Takes: { message: string }
// Returns: { reply: string }
//
// Uses Groq API (free tier) with Llama 3.3 70B model
// Requires env variable: GROQ_API_KEY
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
    const userMessage = (body.message || "").trim();

    if (!userMessage) {
      return new Response(JSON.stringify({ reply: "Please ask a question." }), { headers });
    }

    // Get API key from environment
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({
        reply: "I could not generate a response. Please try again."
      }), { headers });
    }

    // System prompt: Islamic guide with guardrails
    const systemPrompt = `You are an Islamic knowledge assistant for the NABA QURAN app. Your role is to help users understand Islam, Quran, Tajweed, and Islamic practices.

GUIDELINES:
- Provide accurate, well-sourced answers based on Quran and Sunnah
- When unsure, say "I don't have enough knowledge to answer this. Please consult a qualified scholar."
- Do NOT give fatwa (religious rulings). Direct users to qualified scholars for specific rulings.
- Be respectful, concise, and clear
- Use simple English that non-native speakers can understand
- When quoting Quran, mention the surah name and verse number
- For Tajweed questions, explain rules clearly with examples
- Encourage users to verify information through reliable Islamic sources

You are NOT a replacement for qualified scholars. You are a learning assistant.`;

    // Call Groq API
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!groqResponse.ok) {
      console.error("Groq API error:", groqResponse.status, await groqResponse.text());
      return new Response(JSON.stringify({
        reply: "I could not generate a response. Please try again."
      }), { headers });
    }

    const groqData = await groqResponse.json();
    const reply = groqData.choices?.[0]?.message?.content || "I could not generate a response. Please try again.";

    return new Response(JSON.stringify({ reply }), { headers });

  } catch (e) {
    console.error("islamicAiProxy error:", e);
    return new Response(JSON.stringify({
      reply: "I could not generate a response. Please try again."
    }), { headers });
  }
});