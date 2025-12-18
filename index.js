import express from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public")); // Serve static HTML files

const REGISTRATIONS_FILE = "registrations.json";

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

// Load registrations from file
async function loadRegistrations() {
  try {
    const data = await fs.readFile(REGISTRATIONS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet, return empty array
    return [];
  }
}

// Save registrations to file
async function saveRegistrations(registrations) {
  await fs.writeFile(REGISTRATIONS_FILE, JSON.stringify(registrations, null, 2));
}

// Registration endpoint
app.post("/api/register", async (req, res) => {
  const { address, email } = req.body;

  // Basic validation
  if (!address || !email) {
    return res.status(400).json({ error: "Address and email are required" });
  }

  // Validate Stacks address format (basic check)
  if (!address.startsWith("ST") && !address.startsWith("SP")) {
    return res.status(400).json({ error: "Invalid Stacks address format" });
  }

  // Validate email format (basic check)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    const registrations = await loadRegistrations();

    // Check if address already registered
    const existing = registrations.find(r => r.address === address);
    if (existing) {
      // Update email if different
      if (existing.email !== email) {
        existing.email = email;
        existing.updatedAt = new Date().toISOString();
        await saveRegistrations(registrations);
        return res.json({ message: "Email updated successfully!" });
      }
      return res.json({ message: "Address already registered with this email" });
    }

    // Add new registration
    registrations.push({
      address,
      email,
      createdAt: new Date().toISOString()
    });

    await saveRegistrations(registrations);
    console.log(`New registration: ${address} -> ${email}`);

    res.json({ message: "Registration successful! You'll be notified of incoming STX transfers." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Failed to register" });
  }
});

// Webhook endpoint
app.post("/webhook/stx-received", async (req, res) => {
  const payload = req.body;
  
  console.log("Webhook received");

  // Check if this is a rollback
  if (payload.rollback && payload.rollback.length > 0) {
    console.log("Ignoring rollback event");
    return res.sendStatus(200);
  }

  // Check if we have apply events
  if (!payload.apply || payload.apply.length === 0) {
    return res.sendStatus(200);
  }

  try {
    // Load all registered addresses
    const registrations = await loadRegistrations();
    
    if (registrations.length === 0) {
      console.log("No registered addresses yet");
      return res.sendStatus(200);
    }

    // Create a map for quick lookup
    const addressMap = new Map(
      registrations.map(r => [r.address, r.email])
    );

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
            
            // Check if recipient is in our registered addresses
            if (addressMap.has(recipient)) {
              const email = addressMap.get(recipient);
              const amountSTX = Number(amount) / 1_000_000;
              
              console.log(`STX received: ${amountSTX} STX from ${sender} to ${recipient}`);
              
              try {
                await transporter.sendMail({
                  from: `"Notifaya" <${process.env.EMAIL_USER}>`,
                  to: email,
                  subject: "💰 You received STX!",
                  text: `You just received ${amountSTX} STX from ${sender}\n\nTo address: ${recipient}\nTransaction: ${tx.transaction_identifier.hash}`
                });
                
                console.log(`Email sent to ${email}`);
              } catch (error) {
                console.error("Failed to send email:", error);
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

// Health check endpoint
app.get("/api/status", async (req, res) => {
  const registrations = await loadRegistrations();
  res.json({ 
    status: "running",
    registrations: registrations.length 
  });
});

app.listen(3000, () => {
  console.log("Notifaya server running on http://localhost:3000");
});