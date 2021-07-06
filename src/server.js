const express = require("express");
const app = express();
// Copy the .env.example in the root into a .env file in this folder
const stripe = require("stripe")( process.env.STRIPE_SECRET_KEY, {apiVersion: '2020-08-27'})

app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function(req, res, buf) {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    }
  })
);

const calculateOrderAmount = items => {
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1400;
};

app.get("/", async (req, res) => {
  const { items, currency,} = req.body;
  res.send({
    msg: `hello ${items}` ,
  });
});

app.post("/initiate-pay-sheet", async (req, res) => {
  const { items, currency, customer_id } = req.body;
  const ephemeralKey =await stripe.ephemeralKeys.create({ customer: customerId },{ api_version: "2020-08-27" },);   
  const paymentIntent = await stripe.paymentIntents.create({
    amount: calculateOrderAmount(items),
    currency: currency,
    customer: customer_id
  });
  // Send publishable key and PaymentIntent details to client
  res.send({
    publicKey: process.env.STRIPE_PUBLISHABLE_KEY,
    clientSecret: paymentIntent.client_secret,
    id: paymentIntent.id,
    ephemeral_key: ephemeralKey
  });
});

// Webhook handler for asynchronous events.
app.post("/webhook", async (req, res) => {
  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers["stripe-signature"];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // we can retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "payment_method.attached") {
    // The PaymentMethod is attached
    console.log("❗ PaymentMethod successfully attached to Customer");
  } else if (eventType === "payment_intent.succeeded") {
    if (data.object.setup_future_usage === null) {
      console.log("❗ Customer did not want to save the card. ");
    }

    // Funds have been captured
    // Fulfill any orders, e-mail receipts, etc
    // To cancel the payment after capture you will need to issue a Refund (https://stripe.com/docs/api/refunds)
    console.log("💰 Payment captured!");
  } else if (eventType === "payment_intent.payment_failed") {
    console.log("❌ Payment failed.");
  }
  res.sendStatus(200);
});

app.listen(process.env.PORT, () => console.log(`Node server listening on port`,process.env.PORT));
