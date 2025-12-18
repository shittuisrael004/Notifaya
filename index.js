import express from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verify email config on startup
transporter.verify((error) => {
  if (error) console.error("Email config error:", error);
  else console.log("Email server ready");
});

app.post("/webhook/stx-received", async (req, res) => {
  const payload = req.body;
  
  // console.log("Webhook received:", JSON.stringify(payload, null, 2));

  // Check if this is a rollback
  if (payload.rollback && payload.rollback.length > 0) {
    console.log("Ignoring rollback event");
    return res.sendStatus(200);
  }

  // Check if we have apply events
  if (!payload.apply || payload.apply.length === 0) {
    return res.sendStatus(200);
  }

  const watchedAddress = "ST267C6MQJHPR7297033Z8VSKTJM7M62V3784NDT5";

  // Process each block in the apply array
  for (const block of payload.apply) {
    if (!block.transactions) continue;

    // Process each transaction
    for (const tx of block.transactions) {
      const events = tx.metadata?.receipt?.events || [];
      
      // Look for STX transfer events
      for (const event of events) {
        if (event.type === "STXTransferEvent") {
          const { sender, recipient, amount } = event.data;
          
          // Check if transfer is to our watched address
          if (recipient === watchedAddress) {
            const amountSTX = Number(amount) / 1_000_000;
            
            console.log(`STX received: ${amountSTX} STX from ${sender}`);
            
            try {
              await transporter.sendMail({
                from: `"Notifaya" <${process.env.EMAIL_USER}>`,
                to: process.env.NOTIFY_EMAIL,
                subject: "💰 You received STX!",
                text: `You just received ${amountSTX} STX from ${sender}\n\nTransaction: ${tx.transaction_identifier.hash}`
              });
              
              console.log("Email sent successfully");
            } catch (error) {
              console.error("Failed to send email:", error);
            }
          }
        }
      }
    }
  }

  res.sendStatus(200);
});

app.listen(3000, () => {
  console.log("Webhook server running on http://localhost:3000");
});