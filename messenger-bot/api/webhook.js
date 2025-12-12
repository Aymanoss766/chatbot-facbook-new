// messenger-bot/api/webhook.js
// Note: Node 18+ and Next.js provide a global fetch. If you need node-fetch in older Node versions,
// conditionally import it (commented out below).
// import fetch from "node-fetch";

export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!VERIFY_TOKEN || !PAGE_ACCESS_TOKEN || !GROQ_API_KEY) {
    console.error("Missing required environment variables");
    return res.status(500).send("Server misconfigured");
  }

  // --------------------
  // VERIFY TOKEN (GET)
  // --------------------
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK VERIFIED!");
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send("Verification failed");
    }
  }

  // --------------------
  // HANDLE MESSAGES (POST)
  // --------------------
  if (req.method === "POST") {
    const body = req.body;

    if (body && body.object === "page" && Array.isArray(body.entry)) {
      try {
        for (const entry of body.entry) {
          if (!Array.isArray(entry.messaging)) continue;

          // process all messaging events in this entry
          for (const event of entry.messaging) {
            // ignore message echoes (messages sent by the page itself)
            if (event.message && event.message.is_echo) continue;

            // handle text messages only
            if (event.message && typeof event.message.text === "string") {
              const senderId = event.sender?.id;
              const userText = event.message.text;

              if (!senderId) continue;

              const reply = await askGroq(userText, GROQ_API_KEY);
              await sendMessage(senderId, reply, PAGE_ACCESS_TOKEN);
            }

            // you can add handling here for postbacks, attachments, quick_replies, etc.
          }
        }

        return res.status(200).send("EVENT_RECEIVED");
      } catch (err) {
        console.error("Error handling webhook POST:", err);
        return res.status(500).send("Internal Server Error");
      }
    } else {
      return res.sendStatus(404);
    }
  }

  return res.status(405).send("Method Not Allowed");
}

// --------------------
// Groq API
// --------------------
async function askGroq(text, GROQ_API_KEY) {
  try {
    const endpoint = "https://api.groq.com/openai/v1/chat/completions";
    const payload = {
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: text }]
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Groq API error:", response.status, errText);
      return "حدث خطأ في الرد";
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? "لا يوجد رد";
  } catch (err) {
    console.error("askGroq error:", err);
    return "حدث خطأ في الرد";
  }
}

// --------------------
// Send Message to FB
// --------------------
async function sendMessage(id, text, token) {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id },
          message: { text }
        })
      }
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("Facebook send message failed:", resp.status, errText);
    }
  } catch (err) {
    console.error("sendMessage error:", err);
  }
}
