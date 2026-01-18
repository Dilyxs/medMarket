# 🚀 Quick Start - Solana Integration

## ⚡ Get Started in 3 Steps

### 1️⃣ Set Your Wallet Address

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_SOL_RECEIVER=YOUR_MAINNET_WALLET_PUBLIC_ADDRESS
```

### 2️⃣ Start Backend (Terminal 1)

```bash
cd backend/server
go run main.go
```

Should see: `medMarket backend server running on :8080`

### 3️⃣ Start Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

Visit: http://localhost:3000

---

## ✅ What's Been Installed

### Frontend Packages
- `@solana/web3.js` - Solana blockchain interaction
- `@solana/wallet-adapter-react` - React hooks for wallets
- `@solana/wallet-adapter-react-ui` - Pre-built wallet UI
- `@solana/wallet-adapter-wallets` - Phantom & other wallets

### New Files
- `app/providers.tsx` - Wallet context provider (mainnet)
- `components/solana-deposit.tsx` - Deposit UI component
- `backend/server/pkg/solana.go` - Transaction verification
- `.env.local` - Configuration

### Updated Files
- `app/layout.tsx` - Wrapped with SolanaProviders
- `app/page.tsx` - Added SolanaDeposit component
- `backend/server/main.go` - Added /verify_deposit endpoint

---

## 🎮 Testing

1. **Install Phantom Wallet** (Chrome/Brave extension)
2. **Get SOL** - Add funds to your wallet
3. **Connect Wallet** - Click "Select Wallet" button
4. **Test Deposit** - Send 0.01 SOL
5. **Check Logs** - See verification in backend terminal

---

## ⚠️ Before Production

### Required:
- [ ] Add database table for deposits (see SOLANA_SETUP.md)
- [ ] Implement replay attack prevention (unique signature constraint)
- [ ] Add rate limiting to /verify_deposit
- [ ] Connect deposit to user credit system
- [ ] Test thoroughly on devnet first

### Security:
- ✅ No private keys in code
- ✅ Backend verifies all transactions on-chain
- ✅ CORS configured (localhost only for dev)
- ❌ Need DB storage for signatures (prevent replay)
- ❌ Need rate limiting (prevent spam)

---

## 📍 Where's the Component?

The Solana deposit widget is in the **bottom-left quadrant** under "Place your bets".

To move it elsewhere, import and use:
```tsx
import { SolanaDeposit } from "@/components/solana-deposit";

<SolanaDeposit />
```

---

## 🔧 Configuration

### Mainnet (Production)
```tsx
// app/providers.tsx (current)
const endpoint = "https://api.mainnet-beta.solana.com";
```

### Devnet (Testing)
```tsx
// app/providers.tsx
const endpoint = "https://api.devnet.solana.com";
```

Get devnet SOL: https://faucet.solana.com/

---

## 🆘 Common Issues

**"Please connect your wallet first"**
→ Install Phantom wallet extension and create/import wallet

**"Transaction not confirmed yet"**  
→ Normal - Solana takes 5-10 seconds to confirm

**"Verification failed"**
→ Check backend is running on port 8080
→ Check CORS is allowing localhost

**Build errors in Next.js**
→ Restart dev server: `npm run dev`
→ Clear .next folder: `rm -rf .next`

---

## 📖 Full Documentation

See `SOLANA_SETUP.md` for:
- Complete security guide
- Database schema
- Replay attack prevention
- Production checklist

---

## 💰 Current Flow

1. User connects Phantom wallet
2. User enters SOL amount (default 0.01)
3. User clicks "Deposit"
4. Transaction sent to your receiver address
5. Backend verifies transaction on-chain
6. Success message shown
7. **TODO:** Credit user account in your DB

Next step: Connect the verification to your user credit system!
