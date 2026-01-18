# Solana Integration Setup Guide

## ✅ Installation Complete

Solana integration has been added to your medMarket app with **mainnet** configuration.

---

## 🔧 Configuration Required

### 1. Set Your Receiver Wallet Address

Edit `frontend/.env.local` and replace the placeholder:

```env
NEXT_PUBLIC_SOL_RECEIVER=YOUR_ACTUAL_MAINNET_WALLET_PUBLIC_ADDRESS
```

**Important:** Use your **public address only** (never private key). This is where users will send SOL.

---

## 📁 Files Created

### Frontend (Next.js)
- `app/providers.tsx` - Solana wallet provider setup (mainnet)
- `components/solana-deposit.tsx` - Wallet connect + deposit UI
- `.env.local` - Environment variables

### Backend (Go)
- `pkg/solana.go` - Transaction verification logic
- Updated `main.go` - Added `/verify_deposit` endpoint

---

## 🔒 How It Works (Security Flow)

1. **User connects wallet** (Phantom, etc.) in frontend
2. **User sends SOL** to your receiver address via SystemProgram.transfer
3. **Frontend sends signature** to your Go backend at `http://localhost:8080/verify_deposit`
4. **Backend verifies**:
   - ✓ Transaction is confirmed/finalized on-chain
   - ✓ Correct receiver address
   - ✓ Correct amount received
   - ✓ Sender matches user wallet
5. **Backend credits user** (you'll need to add DB logic)

---

## 🚀 Usage

### Add Deposit Component to Your Page

```tsx
import { SolanaDeposit } from "@/components/solana-deposit";

// Add anywhere in your component:
<SolanaDeposit />
```

### Run the App

```bash
# Terminal 1 - Go backend
cd backend/server
go run main.go

# Terminal 2 - Next.js frontend  
cd frontend
npm run dev
```

---

## ⚠️ Critical Security Notes

### 1. Prevent Replay Attacks
Add DB storage for used signatures in `pkg/solana.go`:

```go
// TODO: Add this to VerifyDeposit function after verification passes:
// INSERT INTO deposits (signature, user_wallet, lamports, created_at) 
// VALUES (?, ?, ?, NOW())
// 
// Create table:
// CREATE TABLE deposits (
//   signature TEXT PRIMARY KEY,
//   user_wallet TEXT NOT NULL,
//   lamports BIGINT NOT NULL,
//   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// );
```

### 2. Rate Limiting
Add rate limiting to `/verify_deposit` endpoint to prevent spam.

### 3. Environment Variables
- Never commit `.env.local` to git (already in .gitignore)
- Never put private keys anywhere in code
- For production, use environment variable management (Vercel, Railway, etc.)

### 4. Mainnet Considerations
This is configured for **real SOL on mainnet**. For testing:
- Change endpoint to devnet: `https://api.devnet.solana.com`
- Use devnet faucet: https://faucet.solana.com/
- Get test SOL before switching to mainnet

---

## 🧪 Testing Flow

1. Install Phantom wallet extension
2. Create/import a wallet with some SOL
3. Visit your app and click "Select Wallet"
4. Enter amount and click "Deposit"
5. Approve transaction in Phantom
6. Check backend logs for verification
7. Frontend shows success message

---

## 🛠 Next Steps

### Required for Production:
1. ✅ Set `NEXT_PUBLIC_SOL_RECEIVER` in `.env.local`
2. ❌ Add database table for deposits
3. ❌ Implement user credit system in backend
4. ❌ Add rate limiting to verification endpoint
5. ❌ Set up proper error monitoring

### Optional Enhancements:
- Add transaction history UI
- Show user's SOL balance
- Add withdrawal functionality (requires secure key management)
- Add USD conversion display
- Add minimum deposit validation

---

## 📊 Database Schema Example

```sql
CREATE TABLE deposits (
  id SERIAL PRIMARY KEY,
  signature TEXT UNIQUE NOT NULL,
  user_wallet TEXT NOT NULL,
  lamports BIGINT NOT NULL,
  sol_amount DECIMAL(18, 9),
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deposits_user_wallet ON deposits(user_wallet);
CREATE INDEX idx_deposits_created_at ON deposits(created_at);
```

---

## 🆘 Troubleshooting

### "Connect wallet first"
- Install Phantom wallet extension
- Create/import wallet with SOL balance

### "Transaction not confirmed yet"
- Wait 5-10 seconds and the component will retry
- Solana confirmations can take a few seconds

### "Receiver address not found"
- Check `.env.local` has correct public address
- Restart dev server after changing env vars

### CORS errors
- Backend has CORS enabled for all origins (localhost safe)
- For production, restrict to your domain only

---

## 📚 Resources

- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
- [Wallet Adapter Docs](https://github.com/solana-labs/wallet-adapter)
- [Solana RPC API](https://docs.solana.com/api/http)
- [Phantom Wallet](https://phantom.app/)

---

**Need help?** The code includes TODO comments where you need to add your business logic (DB storage, user credits, etc.).
