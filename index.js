// ============================================================================
// NOTIFAYA - STX Payment Notification Service
// ============================================================================
// Monitors Stacks blockchain and sends email notifications for STX transfers
// ============================================================================

import express from "express";
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
import fs from "fs/promises";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const REGISTRATIONS_FILE = "registrations.json";

// ============================================================================
// EMAIL SETUP
// ============================================================================

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

if (process.env.SENDGRID_API_KEY) {
  console.log("SendGrid configured");
} else {
  console.error("SENDGRID_API_KEY missing");
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

async function loadRegistrations() {
  try {
    const data = await fs.readFile(REGISTRATIONS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function saveRegistrations(registrations) {
  await fs.writeFile(REGISTRATIONS_FILE, JSON.stringify(registrations, null, 2));
}

// ============================================================================
// ROUTES
// ============================================================================

// Register new address
app.post("/api/register", async (req, res) => {
  const { address, email } = req.body;

  if (!address || !email) {
    return res.status(400).json({ error: "Address and email required" });
  }

  if (!address.startsWith("ST") && !address.startsWith("SP")) {
    return res.status(400).json({ error: "Invalid Stacks address" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  try {
    const registrations = await loadRegistrations();
    const existing = registrations.find(r => r.address === address);
    
    if (existing) {
      if (existing.email !== email) {
        existing.email = email;
        existing.updatedAt = new Date().toISOString();
        await saveRegistrations(registrations);
        return res.json({ message: "Email updated" });
      }
      return res.json({ message: "Already registered" });
    }

    registrations.push({
      address,
      email,
      createdAt: new Date().toISOString()
    });

    await saveRegistrations(registrations);
    console.log(`Registered: ${address} -> ${email}`);

    res.json({ message: "Registration successful! You'll be notified of incoming STX." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Webhook for Chainhook events
app.post("/webhook/stx-received", async (req, res) => {
  const payload = req.body;
  
  console.log("Webhook received");

  if (payload.rollback?.length > 0) {
    console.log("Ignoring rollback");
    return res.sendStatus(200);
  }

  if (!payload.apply?.length) {
    return res.sendStatus(200);
  }

  try {
    const registrations = await loadRegistrations();
    
    if (!registrations.length) {
      console.log("No registrations");
      return res.sendStatus(200);
    }

    const addressMap = new Map(registrations.map(r => [r.address, r.email]));

    for (const block of payload.apply) {
      if (!block.transactions) continue;

      for (const tx of block.transactions) {
        const events = tx.metadata?.receipt?.events || [];
        
        for (const event of events) {
          if (event.type === "STXTransferEvent") {
            const { sender, recipient, amount } = event.data;
            
            if (addressMap.has(recipient)) {
              const email = addressMap.get(recipient);
              const amountSTX = Number(amount) / 1_000_000;
              
              console.log(`${amountSTX} STX: ${sender} -> ${recipient}`);
              
              try {
                await sgMail.send({
                  to: email,
                  from: {
                    email: process.env.EMAIL_USER,
                    name: 'Notifaya App'
                  },
                  subject: "You received STX!",
                  text: `You received ${amountSTX} STX from ${sender}\n\nTo: ${recipient}\nTx: ${tx.transaction_identifier.hash}`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2 style="color: #667eea;">You received STX!</h2>
                      <p style="font-size: 18px; margin: 20px 0;"><strong>${amountSTX} STX</strong></p>
                      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0; color: #666;"><strong>From:</strong><br/><code style="font-size: 12px;">${sender}</code></p>
                        <p style="margin: 5px 0; color: #666;"><strong>To:</strong><br/><code style="font-size: 12px;">${recipient}</code></p>
                      </div>
                      <a href="https://explorer.hiro.so/txid/${tx.transaction_identifier.hash}?chain=testnet" 
                         style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
                        View Transaction
                      </a>
                      <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
                        Powered by Notifaya - STX Payment Notifications
                      </p>
                    </div>
                  `
                });
                
                console.log(`Email sent to: ${email}`);
              } catch (error) {
                console.error("Email failed:", error.response?.body || error.message);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
  }

  res.sendStatus(200);
});

// Health check
app.get("/api/status", async (req, res) => {
  const registrations = await loadRegistrations();
  res.json({ 
    status: "running",
    registrations: registrations.length 
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(3000, () => {
  console.log("Notifaya server running on port 3000");
});