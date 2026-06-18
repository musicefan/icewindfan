import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const NOTIFY_TO = process.env.ORDER_NOTIFY_EMAIL || "icewindfan@gmail.com";
const NOTIFY_FROM = process.env.ORDER_NOTIFY_FROM || "IceWind Fan <onboarding@resend.dev>";

// Stripe needs the raw request body to verify the signature, so disable Vercel's body parser.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function formatAddress(details) {
  if (!details) return "—";
  const a = details.address || {};
  return [
    details.name,
    a.line1,
    a.line2,
    [a.city, a.postal_code].filter(Boolean).join(" "),
    a.state,
    a.country,
  ].filter(Boolean).join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Pull the line items for this order
    let itemsText = "(could not load items)";
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      itemsText = lineItems.data
        .map((li) => `• ${li.quantity} x ${li.description} — £${(li.amount_total / 100).toFixed(2)}`)
        .join("\n");
    } catch (e) {
      console.error("Could not list line items:", e.message);
    }

    const customer = session.customer_details || {};
    const shipping = formatAddress(session.shipping_details || session.customer_details);
    const orderNum = session.metadata?.order_number || session.id;
    const colour = session.metadata?.colour || session.metadata?.order_summary || "(see items)";
    const total = ((session.amount_total || 0) / 100).toFixed(2);

    const body = [
      `New order received 🎉`,
      ``,
      `Order number: ${orderNum}`,
      `Total paid:   £${total}`,
      ``,
      `ITEMS`,
      itemsText,
      colour ? `\nColour / notes: ${colour}` : ``,
      ``,
      `CUSTOMER`,
      `Name:  ${customer.name || "—"}`,
      `Email: ${customer.email || "—"}`,
      `Phone: ${customer.phone || "—"}`,
      ``,
      `SHIPPING ADDRESS`,
      shipping,
      ``,
      `— Sent automatically from icewindfan.co.uk`,
    ].join("\n");

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY not set — cannot send order email.");
    } else {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: NOTIFY_FROM,
            to: [NOTIFY_TO],
            reply_to: customer.email || undefined,
            subject: `New order ${orderNum} — £${total}`,
            text: body,
          }),
        });
        if (!r.ok) {
          console.error("Resend error:", r.status, await r.text());
        }
      } catch (e) {
        console.error("Failed to send order email:", e.message);
      }
    }
  }

  res.status(200).json({ received: true });
}
