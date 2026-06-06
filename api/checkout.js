import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { cart } = req.body;

  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const line_items = cart.map(item => ({
    price_data: {
      currency: "gbp",
      product_data: {
        name: item.name,
        description: item.colour
          ? `Colour: ${item.colour} — IceWindFan UK`
          : "IceWindFan — UK's #1 Portable Ice Fan",
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.qty || 1,
  }));

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      allow_promotion_codes: true,
      customer_creation: "always",
      shipping_address_collection: { allowed_countries: ["GB"] },
      phone_number_collection: { enabled: true },
      consent_collection: { terms_of_service: "none" },
      invoice_creation: { enabled: true },
      success_url: "https://icewindfan.co.uk/thank-you.html",
      cancel_url: "https://icewindfan.co.uk/index.html",
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
