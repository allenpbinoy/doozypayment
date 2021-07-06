const express = require("express");
const send = require("send");
const app = express();
const path = require("path");
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

app.get("/.well-known/apple-developer-merchantid-domain-association", async (req, res) => {
  try{
  res.sendFile(path.resolve(process.cwd(), 'src/apple-developer-merchantid-domain-association'));
  }catch(e){
  res.status(201).send({"error":"Unable to load the file","message":`${e}`});
  }
});

app.get("/check", async (req, res) => {
  const { items, currency,} = req.query;
  const ephemeralKey =await stripe.ephemeralKeys.create({ customer: customerId },{ api_version: "2020-08-27" },);
  res.send({
    publicKey: process.env.STRIPE_PUBLISHABLE_KEY,
    sk:process.env.STRIPE_SECRET_KEY,
    ephemeral_key: ephemeralKey
  });
});

app.get("/root", async (req, res) => {
  res.send({
    root: process.cwd(),
    file: path.resolve(process.cwd(), 'src/apple-developer-merchantid-domain-association'),
    
  });
});

app.post("/customer/create",async (req,res) => {
 try{
  const {name, uid, description, phone,} = req.body;
  res.send({
    body: req.body,
    query: req.params,
  });
  // const customer =await stripe.customers.create({
  //  description: description || "Doozy Customer",
  //  metadata: {
  //    uid: uid,
  //    name: name,
  //    phone: phone,
  //  },
  // });
  // res.status(200).send(customer);
 } catch(e){
  res.status(201).send({"status": "Unable to finish request","error":`${e}`});
 }
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

app.listen(process.env.PORT, async () => {
  console.log(`Node server listening on port`,process.env.PORT)
});
