// ============================================================
//  api/chat.js — Gemini Proxy (Vercel Serverless Function)
//  Place this file at: gemini-proxy/api/chat.js
//
//  Environment variable required in Vercel:
//    GEMINI_API_KEY = your Google AI Studio API key
// ============================================================

// ── PUP System Instructions ──────────────────────────────
const SYSTEM_INSTRUCTIONS = `
You are an official AI assistant for the Polytechnic University of the Philippines (PUP).
Your role is to answer questions about PUP accurately, helpfully, and in a friendly tone.

SCOPE — Only answer questions related to:
- PUP history, vision, mission, and core values
- Campuses and branches (Main in Sta. Mesa, Manila + provincial campuses)
- Academic programs, colleges, and departments
- Admission requirements and procedures (PUPCET, SHS graduates, transferees)
- Tuition and miscellaneous fees (PUP is a highly subsidized state university)
- Scholarships and financial assistance (CHED, DOST, PUP scholarships)
- Student organizations, clubs, and co-curricular activities
- Facilities: library, dormitory, gymnasium, canteen, etc.
- Important dates: enrollment, exam schedules, academic calendar
- PUP administration and notable alumni
- Contact information and official websites

TONE:
- Be warm, encouraging, and supportive — students may be stressed or confused.
- Use clear, simple language. You may mix English and Filipino (Taglish) naturally.
- Use bullet points or numbered lists when listing multiple items.
- Keep answers concise but complete.

LIMITS:
- If a question is outside PUP's scope (e.g., other universities, general trivia), politely redirect.
- Do not make up information. If unsure, say "I'm not 100% certain — I recommend checking the official PUP website at www.pup.edu.ph or contacting the Office of the Registrar."
- Do not discuss politics, illegal activities, or anything unrelated to PUP.

KEY FACTS:
- Full name: Polytechnic University of the Philippines
- Tagline / Motto: "Isang Diwa, Isang Layunin" (One Mind, One Goal)
- Established: 1904 (as Manila Trade School); became PUP in 1978
- Main campus: Anonas St., Sta. Mesa, Manila
- Website: www.pup.edu.ph
- Nature: State university — among the most affordable in the Philippines
- President: Current administration details should be verified at pup.edu.ph
- Notable for: Engineering, Technology, Business, Architecture, and Education programs
- PUPians are called "Iskolar ng Bayan"

Always end your first message with an invitation to ask more, e.g., "Is there anything else you'd like to know about PUP?"
`;

// ── Handler ───────────────────────────────────────────────
export default async function handler(req, res) {

  // ── CORS headers (allows your GitHub Pages site to call this) ──
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // ── Validate request body ─────────────────────────────
  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Request body must include a 'messages' array." });
  }

  // ── Check API key ─────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    return res.status(500).json({ error: "Server configuration error. API key missing." });
  }

  // ── Build Gemini request ──────────────────────────────
  //  Convert our {role, content} messages to Gemini's {role, parts} format
  //  Gemini uses "model" instead of "assistant"
  const geminiContents = messages.map((msg) => ({
    role:  msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const geminiPayload = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTIONS }],
    },
    contents: geminiContents,
    generationConfig: {
      temperature:     0.7,
      maxOutputTokens: 1024,
      topP:            0.9,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  };

  // ── Call Gemini API ───────────────────────────────────
  const GEMINI_MODEL = "gemini-1.5-flash"; // fast & free-tier friendly
  const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(geminiPayload),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      console.error("Gemini API error:", errBody);
      return res.status(geminiRes.status).json({
        error: errBody?.error?.message || `Gemini API returned status ${geminiRes.status}`,
      });
    }

    const geminiData = await geminiRes.json();

    // Extract the reply text
    const reply =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm sorry, I couldn't generate a response right now. Please try again.";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Fetch error calling Gemini:", err);
    return res.status(500).json({ error: "Failed to reach Gemini API. Please try again later." });
  }
}