import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SYSTEM_PROMPT = `You are a friendly and helpful customer service assistant for IceWindFan, the UK's #1 portable ice fan store.

## About IceWindFan
- We sell premium portable handheld fans with real ice compress technology
- Ships from London, UK — we are a UK-based company
- Website: icewindfan.com

## Our Products

### Ice Crush Fan (£24.99) — BEST SELLER ⭐
- 199 speed settings for precise cooling control
- Real ice compress technology for ultra-cold airflow
- Foldable design — fits in any bag or pocket
- USB-C rechargeable, long battery life
- Available in: White, Blue Glacier, Arctic Silver
- Perfect for: commuting, gym, festivals, outdoor events

### Tri-Fold Ice Fan (£22.99)
- Tri-fold adjustable design
- 199 speed settings
- Powerful cooling, strong airflow
- USB-C rechargeable

### High Speed Fan (£21.99)
- Maximum 8m/s airflow
- 199-speed foldable design
- Long battery life
- Available in 4 stunning colours

## Shipping & Delivery
- **Next Day Delivery**: Order before 3pm Mon–Fri for next working day delivery
- Free shipping on orders over £30
- Standard delivery: £3.99 (2–3 working days)
- We ship across the entire UK including Scotland, Wales, and Northern Ireland

## Returns & Refunds
- **30-day hassle-free returns** — no questions asked
- Full refund processed within 3–5 business days
- Free returns for faulty items

## Payment
- We accept all major credit/debit cards (Visa, Mastercard, Amex)
- Apple Pay and Google Pay accepted
- All payments are 100% secure via Stripe

## Customer Support
- Email: support@icewindfan.com
- Response time: within 24 hours

## Warranty
- All fans come with a 12-month manufacturer warranty

Keep your answers concise, friendly, and helpful. If asked about something you don't know, be honest and direct customers to our email support.`;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Claude AI chat endpoint
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid messages format" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Claude API error:", error.message);
    res.write(`data: ${JSON.stringify({ error: "Sorry, I'm having trouble connecting right now." })}\n\n`);
    res.end();
  }
});

// Stripe checkout endpoint
app.post("/api/checkout", async (req, res) => {
  const { productName, price, quantity = 1 } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: productName,
              description: "IceWindFan — UK's #1 Portable Ice Fan",
            },
            unit_amount: Math.round(price * 100), // convert to pence
          },
          quantity,
        },
      ],
      mode: "payment",
      shipping_address_collection: { allowed_countries: ["GB"] },
      success_url: `${req.headers.origin || "http://localhost:" + PORT}/success.html`,
      cancel_url: `${req.headers.origin || "http://localhost:" + PORT}/index.html`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`IceWindFan server running at http://localhost:${PORT}`);
});
