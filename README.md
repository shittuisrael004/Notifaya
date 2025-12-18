# 💰 Notifaya

Get instant email notifications when you receive STX on the Stacks blockchain. Simple, lightweight, and self-hosted.

Vibecoded!

## 🚀 Features

- **Real-time Notifications** - Instant email alerts when STX arrives in your wallet
- **Multi-User Support** - Monitor multiple Stacks addresses simultaneously
- **Clean Web UI** - Simple registration form for adding addresses
- **Powered by Chainhook** - Uses Hiro's Chainhook for reliable blockchain monitoring
- **Self-Hosted** - Full control over your data and notifications

## 📋 Prerequisites

- Node.js (v16 or higher)
- Gmail account (for sending emails)
- Hiro Chainhook setup (see setup guide below)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd notifaya
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a `.env` file**
   ```bash
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   NOTIFY_EMAIL=where-to-send-notifications@gmail.com
   ```

   > **Note**: For Gmail, you need to use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password.

4. **Create the public directory**
   ```bash
   mkdir public
   ```
   Then save the provided HTML file as `public/index.html`

## 🔧 Setting Up Chainhook

1. **Install Chainhook**
   ```bash
   # Follow Hiro's official installation guide
   # https://docs.hiro.so/stacks/chainhook
   ```

2. **Create a Chainhook predicate** (`stx-transfer-predicate.json`)
   ```json
   {
     "chain": "stacks",
     "uuid": "stx-transfer-notifier",
     "name": "STX Transfer Monitor",
     "version": 1,
     "networks": {
       "testnet": {
         "if_this": {
           "scope": "stx_event",
           "actions": ["transfer"]
         },
         "then_that": {
           "http_post": {
             "url": "http://localhost:3000/webhook/stx-received",
             "authorization_header": "Bearer optional-secret-token"
           }
         }
       }
     }
   }
   ```

3. **Register the predicate**
   ```bash
   chainhook predicates scan stx-transfer-predicate.json --testnet
   ```

## 🎯 Usage

1. **Start the server**
   ```bash
   npm start
   ```

2. **Open the web interface**
   ```
   http://localhost:3000
   ```

3. **Register your Stacks address**
   - Enter your Stacks address (starting with `ST` for testnet or `SP` for mainnet)
   - Enter your email address
   - Click "Start Monitoring"

4. **Receive notifications!**
   - You'll get an email every time STX is sent to your registered address
   - Each email includes sender info and transaction hash

## 📁 Project Structure

```
notifaya/
├── index.js              # Main server with webhook and API endpoints
├── public/
│   └── index.html        # Registration form UI
├── registrations.json    # Stores user registrations (auto-created)
├── .env                  # Environment variables (create this)
├── package.json
└── README.md
```

## 🔐 Security Notes

- Never commit your `.env` file
- Use Gmail App Passwords, not your account password
- Consider adding webhook signature verification for production
- Rate limit the registration endpoint if exposing publicly

## 🐛 Troubleshooting

**Emails not sending?**
- Verify your Gmail credentials in `.env`
- Check if "Less secure app access" is enabled (or use App Password)
- Look for errors in console when server starts

**Webhook not receiving data?**
- Ensure Chainhook is running and properly configured
- Check that the webhook URL matches your server
- Verify your predicate is registered: `chainhook predicates list`

**Address not being monitored?**
- Check `registrations.json` to see if address was saved
- Verify address format (must start with ST or SP)
- Check server logs for registration errors

## 📊 API Endpoints

### `POST /api/register`
Register a new address for monitoring
```json
{
  "address": "ST267C6MQJHPR7297033Z8VSKTJM7M62V3784NDT5",
  "email": "you@example.com"
}
```

### `POST /webhook/stx-received`
Webhook endpoint for Chainhook (internal use)

### `GET /api/status`
Check server status and registration count
```json
{
  "status": "running",
  "registrations": 5
}
```

## 🚦 Roadmap

- [ ] Add unsubscribe functionality
- [ ] Support for SIP-010 token transfers
- [ ] Discord/Slack webhook integration
- [ ] Web dashboard for viewing transaction history
- [ ] Mainnet support with production deployment guide

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📝 License

MIT

## 🙏 Acknowledgments

- Built with [Hiro Chainhook](https://docs.hiro.so/stacks/chainhook)
- Powered by the Stacks blockchain
- Email delivery via Nodemailer

---

Made with ❤️ for the Stacks community