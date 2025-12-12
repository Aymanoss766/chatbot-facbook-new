import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ------------------
// Webhook Verification
// ------------------
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK VERIFIED");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// ------------------
// Handle Messages
// ------------------
app.post("/webhook", async (req, res) => {
    const body = req.body;

    if (body.object === "page") {
        body.entry.forEach(async entry => {
            const event = entry.messaging[0];

            if (event.message && event.message.text) {
                const senderId = event.sender.id;
                const userMessage = event.message.text;

                const botReply = await askGroq(userMessage);
                await sendMessage(senderId, botReply);
            }
        });

        res.status(200).send("EVENT_RECEIVED");
    } else {
        res.sendStatus(404);
    }
});

// ------------------
// Groq API Request
// ------------------
async function askGroq(userText) {
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "user", content: userText }
                ]
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (err) {
        console.log("Groq Error:", err);
        return "حدث خطأ في الخادم!";
    }
}

// ------------------
// Send Response to Facebook
// ------------------
async function sendMessage(senderId, text) {
    await fetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            recipient: { id: senderId },
            message: { text }
        })
    });
}

// ------------------
// Start Server
// ------------------
app.listen(3000, () => {
    console.log("Server running on port 3000");
});
