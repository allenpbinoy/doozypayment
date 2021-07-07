const express = require("express");
const send = require("send");
const app = express();
const path = require("path");
const stripe = require("stripe")( process.env.STRIPE_SECRET_KEY, {apiVersion: '2020-08-27'})
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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


app.post("/test", async (req, res) => {
  const {customer_id} = req.body;
 try{
   res.status(200).send({
    publicKey: process.env.STRIPE_PUBLISHABLE_KEY,
    sk:process.env.STRIPE_SECRET_KEY,
    root: process.cwd(),
    file: path.resolve(process.cwd(), 'src/apple-developer-merchantid-domain-association'),
    port: process.env.PORT,
   });
 }catch(e){
  res.status(201).send({"error":"Unable to check","message":`${e}`});
 }
});


app.post('/api/create/stripe-customer', upload.array(), async (request, response) => {
  const {name, uid, phone, email} = request.body;
  try{
   if(name&& uid && phone){
    const customer = await stripe.customers.create({
    name: name,
    phone: phone,
    description: uid,
    email: email,
    });
    response.status(200).send(customer);
   }else{
    response.status(203).send({"status": "Missing params { name, uid, phone, email}",});
   }
   } catch(e){
    response.status(201).send({"status": "Unable to finish request","error":`${e}`});
   }
});

app.post("/api/create/payment-intent", async (req, res) => {
  const { amount, customer_id, email, order_id,} = req.body;
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: "CAD",
    customer: customer_id,
    receipt_email: email,
    metadata: {
      order_id: order_id
    },
  });
  res.status(200).send({
    clientSecret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
  });
});

app.post("/initiate-pay-sheet", async (req, res) => {
  const { amount, customer_id, payment_intent_id, client_secret} = req.body;
try{
  if( amount && customer_id && payment_intent_id && client_secret){

  const ephemeralKey = await stripe.ephemeralKeys.create(
    {customer: customer_id},
    {apiVersion: '2020-08-27'}
    );  
  res.status(200).send({
    apple_pay: true,
    google_pay: true,
    test_env: true,
    merchant_country_code: 'CA',
    merchant_display_name: 'Doozy Delivery Co.',
    customer_id:customer_id,
    ephemeral_key_secret: ephemeralKey.secret,
    clientSecret:client_secret,
    payment_intent_id:payment_intent_id,
  });
  } else {
  res.status(202).send({"error":"Invalid Parameters passed!","message":`Check params -> amount, customer_id, payment_intent_id, client_secret`});
  }
  } catch(e){
  res.status(201).send({"error":"Oops!, Something went wrong at our end.","message":`${e}`});
  }
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

app.get("/.well-known/apple-developer-merchantid-domain-association", async (req, res) => {
  try{
  res.sendFile(path.resolve(process.cwd(), 'src/apple-developer-merchantid-domain-association'));
  }catch(e){
  res.status(201).send({"error":"Unable to load the file","message":`${e}`});
  }
});