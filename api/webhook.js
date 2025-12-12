import fetch from "node-fetch";

export default async function handler(req, res) {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

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

        if (body.object === "page") {
            for (const entry of body.entry) {
                const event = entry.messaging[0];

                if (event.message && event.message.text) {
                    const senderId = event.sender.id;
                    const userText = event.message.text;

                    const reply = await askGroq(userText, GROQ_API_KEY);
                    await sendMessage(senderId, reply, PAGE_ACCESS_TOKEN);
                }
            }

            return res.status(200).send("EVENT_RECEIVED");
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
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: text }]
            })
        });

        const data = await response.json();
        return data.choices[0]?.message?.content || "لا يوجد رد";
    } catch (err) {
        console.error(err);
        return "حدث خطأ في الرد";
    }
}

// --------------------
// Send Message to FB
// --------------------
async function sendMessage(id, text, token) {
    await fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            recipient: { id },
            message: { text }
        })
    });
}
