// ============================================================================
// NOTIFAYA - STX Payment Notification Service
// ============================================================================
// This server monitors Stacks blockchain transactions and sends email
// notifications when registered addresses receive STX transfers.
// ============================================================================

import express from "express";
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
import fs from "fs/promises";

// Load environment variables from .env file
dotenv.config();

// Initialize Express application
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files (like our HTML form) from the 'public' directory
app.use(express.static("public"));

// File path where we store user registrations (address + email pairs)
const REGISTRATIONS_FILE = "registrations.json";

// ============================================================================
// EMAIL CONFIGURATION
// ============================================================================
// Configure SendGrid Web API (works on Railway - no SMTP needed)
// Requires SENDGRID_API_KEY in .env file
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Verify API key on startup
if (process.env.SENDGRID_API_KEY) {
  console.log("SendGrid API key configured");
} else {
  console.error("SENDGRID_API_KEY not found in environment variables");
}

// ============================================================================
// HELPER FUNCTIONS FOR MANAGING REGISTRATIONS
// ============================================================================

/**
 * Load all user registrations from the JSON file
 * @returns {Promise<Array>} Array of registration objects {address, email, createdAt}
 */
async function loadRegistrations() {
  try {
    const data = await fs.readFile(REGISTRATIONS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist yet (first run), return empty array
    return [];
  }
}

/**
 * Save registrations array to the JSON file
 * @param {Array} registrations - Array of registration objects to save
 */
async function saveRegistrations(registrations) {
  await fs.writeFile(REGISTRATIONS_FILE, JSON.stringify(registrations, null, 2));
}

// ============================================================================
// API ENDPOINT: USER REGISTRATION
// ============================================================================
// POST /api/register
// Body: { address: "ST...", email: "user@example.com" }
// Purpose: Allow users to register their Stacks address for notifications

app.post("/api/register", async (req, res) => {
  const { address, email } = req.body;

  // ---- VALIDATION ----
  // Ensure both fields are provided
  if (!address || !email) {
    return res.status(400).json({ error: "Address and email are required" });
  }

  // Validate Stacks address format
  // Testnet addresses start with "ST", mainnet with "SP"
  if (!address.startsWith("ST") && !address.startsWith("SP")) {
    return res.status(400).json({ error: "Invalid Stacks address format" });
  }

  // Basic email format validation using regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // ---- REGISTRATION LOGIC ----
  try {
    // Load existing registrations from file
    const registrations = await loadRegistrations();

    // Check if this address is already registered
    const existing = registrations.find(r => r.address === address);
    
    if (existing) {
      // Address exists - update email if it's different
      if (existing.email !== email) {
        existing.email = email;
        existing.updatedAt = new Date().toISOString();
        await saveRegistrations(registrations);
        return res.json({ message: "Email updated successfully!" });
      }
      // Same email, no changes needed
      return res.json({ message: "Address already registered with this email" });
    }

    // New registration - add to array
    registrations.push({
      address,
      email,
      createdAt: new Date().toISOString()
    });

    // Save updated registrations to file
    await saveRegistrations(registrations);
    console.log(`New registration: ${address} -> ${email}`);

    res.json({ message: "Registration successful! You'll be notified of incoming STX transfers." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Failed to register" });
  }
});

// ============================================================================
// WEBHOOK ENDPOINT: CHAINHOOK STX TRANSFER NOTIFICATIONS
// ============================================================================
// POST /webhook/stx-received
// Body: Chainhook payload with transaction data
// Purpose: Receive notifications from Hiro Chainhook when STX transfers occur

app.post("/webhook/stx-received", async (req, res) => {
  const payload = req.body;
  
  console.log("Webhook received");

  // ---- CHECK FOR ROLLBACKS ----
  // Blockchain reorganizations can cause blocks to be rolled back
  // We ignore these to avoid sending duplicate/incorrect notifications
  if (payload.rollback && payload.rollback.length > 0) {
    console.log("Ignoring rollback event");
    return res.sendStatus(200);
  }

  // ---- CHECK FOR VALID DATA ----
  // The 'apply' array contains new blocks to process
  if (!payload.apply || payload.apply.length === 0) {
    return res.sendStatus(200);
  }

  try {
    // Load all registered addresses we're monitoring
    const registrations = await loadRegistrations();
    
    if (registrations.length === 0) {
      console.log("No registered addresses yet");
      return res.sendStatus(200);
    }

    // Create a Map for O(1) lookup of email by address
    // Map structure: { "ST123..." => "user@email.com", ... }
    const addressMap = new Map(
      registrations.map(r => [r.address, r.email])
    );

    // ---- PROCESS BLOCKS ----
    // Each 'apply' entry represents a blockchain block
    for (const block of payload.apply) {
      if (!block.transactions) continue;

      // ---- PROCESS TRANSACTIONS ----
      // Each block can contain multiple transactions
      for (const tx of block.transactions) {
        // Navigate to the events array in the transaction receipt
        const events = tx.metadata?.receipt?.events || [];
        
        // ---- PROCESS EVENTS ----
        // Each transaction can emit multiple events
        for (const event of events) {
          // We only care about STX transfer events
          if (event.type === "STXTransferEvent") {
            const { sender, recipient, amount } = event.data;
            
            // ---- CHECK IF RECIPIENT IS REGISTERED ----
            // If the recipient address is in our monitoring list, send notification
            if (addressMap.has(recipient)) {
              const email = addressMap.get(recipient);
              // Convert from microSTX (1 STX = 1,000,000 microSTX)
              const amountSTX = Number(amount) / 1_000_000;
              
              console.log(`STX received: ${amountSTX} STX from ${sender} to ${recipient}`);
              
              // ---- SEND EMAIL NOTIFICATION ----
              try {
                const msg = {
                  to: email,
                  from: {
                    email: process.env.EMAIL_USER,
                    name: 'Notifaya'
                  },
                  subject: "You received STX!",
                  text: `You just received ${amountSTX} STX from ${sender}\n\nTo address: ${recipient}\nTransaction: ${tx.transaction_identifier.hash}`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2 style="color: #667eea;">You received STX!</h2>
                      <p style="font-size: 18px; margin: 20px 0;">You just received <strong>${amountSTX} STX</strong></p>
                      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0; color: #666;">From: <code style="font-size: 12px;">${sender}</code></p>
                        <p style="margin: 5px 0; color: #666;">To: <code style="font-size: 12px;">${recipient}</code></p>
                     </div>
                        <a href="https://explorer.hiro.so/txid/${tx.transaction_identifier.hash}?chain=testnet" 
                           style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
                          View Transaction
                        </a>
                      <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
                        Powered by Notifaya
                      </p>
                    </div>
                  `
                };
                
                await sgMail.send(msg);
                
                console.log("Email sent to:", email);
              } catch (error) {
                console.error("Failed to send email:", error.response?.body || error.message);
                // Don't throw - continue processing other transactions
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
  }

  // Always return 200 OK to acknowledge receipt
  // This prevents Chainhook from retrying the webhook
  res.sendStatus(200);
});

// ============================================================================
// API ENDPOINT: HEALTH CHECK
// ============================================================================
// GET /api/status
// Purpose: Check if server is running and how many addresses are registered

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
  console.log("Notifaya server running");
});