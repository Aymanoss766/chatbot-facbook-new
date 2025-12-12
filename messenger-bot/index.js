// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json()); // parse JSON bodies

const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Basic sanity checks on startup
if (!PAGE_ACCESS_TOKEN) {
  console.error('Missing PAGE_ACCESS_TOKEN in environment variables.');
  process.exit(1);
}
if (!VERIFY_TOKEN) {
  console.error('Missing VERIFY_TOKEN in environment variables.');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in environment variables.');
  process.exit(1);
}

/**
 * Webhook verification endpoint (GET /webhook)
 * Facebook will call this when you set the webhook URL in the app settings.
 * It expects hub.mode === 'subscribe' and hub.verify_token matching your VERIFY_TOKEN,
 * and you should echo back hub.challenge.
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  } else {
    console.warn('WEBHOOK_VERIFICATION_FAILED', { mode, token });
    return res.sendStatus(403);
  }
});

/**
 * Webhook receiver endpoint (POST /webhook)
 * Receives messages from Facebook and replies using OpenAI and the Graph API.
 */
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Check this is an event from a page subscription
    if (body.object === 'page') {
      // Iterate over each entry - there may be multiple if batched
      for (const entry of body.entry) {
        // Messaging events array
        const messagingEvents = entry.messaging || [];
        for (const event of messagingEvents) {
          const senderPsid = event.sender && event.sender.id;
          // Skip if sender missing (shouldn't happen)
          if (!senderPsid) continue;

          // If it's an incoming message
          if (event.message) {
            // Avoid responding to message echoes (sent by the page itself)
            if (event.message.is_echo) {
              console.log('Skipping echo message');
              continue;
            }

            // If there's text, pass it to OpenAI
            if (event.message.text) {
              const userText = event.message.text;
              console.log(`Received message from ${senderPsid}: ${userText}`);

              try {
                const replyText = await askOpenAI(userText);
                await sendTextMessage(senderPsid, replyText);
                console.log(`Replied to ${senderPsid}`);
              } catch (err) {
                console.error('Error processing message:', err?.message || err);
                // Attempt to send a friendly fallback message
                try {
                  await sendTextMessage(senderPsid, "Sorry — I couldn't process that right now. Please try again later.");
                } catch (sendErr) {
                  console.error('Failed to send fallback message:', sendErr?.message || sendErr);
                }
              }
            } else if (event.message.attachments) {
              // You can handle attachments if you like — simple fallback here
              await sendTextMessage(senderPsid, "Thanks for the attachment! I can only reply to text messages for now.");
            }
          }

          // Handle postback (e.g., persistent menu clicks)
          if (event.postback) {
            const payload = event.postback.payload;
            console.log(`Postback received from ${senderPsid}: ${payload}`);
            await sendTextMessage(senderPsid, `Thanks for interacting! You sent a postback: ${payload}`);
          }
        }
      }

      // Respond to Facebook right away with 200 OK
      res.status(200).send('EVENT_RECEIVED');
    } else {
      // Return 404 for other objects
      res.sendStatus(404);
    }
  } catch (err) {
    console.error('Webhook handling error:', err);
    // Ensure we always respond something
    res.sendStatus(500);
  }
});

/**
 * Send a message to the user via the Facebook Send API
 */
async function sendTextMessage(psid, text) {
  const url = `https://graph.facebook.com/v12.0/me/messages`;
  const params = { access_token: PAGE_ACCESS_TOKEN };

  const body = {
    recipient: { id: psid },
    message: { text },
  };

  const res = await axios.post(url, body, { params });
  return res.data;
}

/**
 * Ask OpenAI (Chat Completions) for a reply to the user's text.
 * Uses the official REST endpoint directly via axios.
 *
 * Note: This example uses "gpt-3.5-turbo". You can change `model` as desired.
 */
async function askOpenAI(userText) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful assistant replying concisely for a Facebook Messenger chatbot.' },
      { role: 'user', content: userText }
    ],
    max_tokens: 500,
    temperature: 0.7
  };

  const headers = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };

  const response = await axios.post(url, payload, { headers });
  // Defensive checks
  if (!response.data || !response.data.choices || response.data.choices.length === 0) {
    throw new Error('Invalid response from OpenAI');
  }

  const assistantMessage = response.data.choices[0].message && response.data.choices[0].message.content;
  return assistantMessage ? assistantMessage.trim() : "I'm sorry — I couldn't generate a reply.";
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
});
