# Per-User Solana Wallet Integration - Complete Guide

## Architecture Overview

Each user now has **their own Solana wallet** created when they sign up. Users can:
- **Deposit** SOL from their personal wallet into the app
- **Withdraw** SOL from the app back to their personal wallet (or any destination)
- **Gamble/use** SOL within the app
- **View** their wallet address and app balance in Settings

## What Was Changed

### 1. **Backend - Wallet Generation** (`backend/server/pkg/solana_wallet.go`)
```go
// New function: GenerateNewWallet()
// Creates a random Solana keypair for each user
func GenerateNewWallet() (publicKey string, secretKey string, err error)
```

### 2. **User Signup** (`frontend/app/api/auth/signup/route.ts`)
- Each user gets a wallet generated on signup
- Wallet address and secret stored in MongoDB user document
```json
{
  "wallet": {
    "address": "test-xxxxx",
    "secret": "test-secret-xxxxx",
    "createdAt": "2026-01-18T..."
  }
}
```

### 3. **Settings Page** (`frontend/app/settings/page.tsx`)
- **Shows wallet address** (with copy button)
- **Displays app balance** (SOL in app)
- **Deposit button** - transfer SOL from wallet to app
- **Withdraw section** - send SOL from app to wallet (or any address)

### 4. **New API Endpoints**

#### **GET /api/user/profile**
Returns user profile with wallet and balance info
```json
{
  "userId": "...",
  "email": "user@example.com",
  "balance": 5.5,
  "wallet": {
    "address": "test-xxxxx"
  }
}
```

#### **POST /api/wallet/deposit**
User deposits SOL from personal wallet to app
- Request: `{ amount, signature }`
- Fee: 0.00005 SOL
- Updates user balance in MongoDB

#### **POST /api/withdraw**
User withdraws SOL from app to destination wallet
- Request: `{ amount, walletAddress }` (walletAddress optional - uses user's wallet if empty)
- Fee: 0.00005 SOL
- Calls Go backend to sign transaction

### 5. **Home Page Components**
- **TestDepositPanel** (yellow) - Add fake SOL for testing
- **WalletDepositPanel** (blue) - Deposit SOL from wallet to app

## User Flow

### New User Signup
```
1. User signs up
2. System generates Solana wallet keypair
3. Wallet address stored in MongoDB
4. User's app balance = 0 SOL
```

### Deposit to App
```
1. User goes to Settings
2. Clicks "Deposit to App" 
3. Transfer SOL from personal wallet to app
4. App receives transaction signature
5. User balance credited (minus 0.00005 SOL fee)
```

### Withdraw from App
```
1. User goes to Settings
2. Enters amount and destination address (or leaves empty for own wallet)
3. Clicks "Withdraw"
4. Backend signs transaction from treasury
5. SOL sent to destination wallet
6. User's app balance deducted
```

## MongoDB Schema Changes

### Users Collection
```javascript
{
  _id: ObjectId,
  email: "user@example.com",
  password: "hashed",
  name: "User Name",
  balance: 5.5,
  wallet: {
    address: "test-xxxxxx",
    secret: "test-secret-xxxxx",
    createdAt: Date
  },
  createdAt: Date
}
```

### Deposits Collection
```javascript
{
  userId: ObjectId,
  signature: "transaction-sig",
  walletAddress: "user-wallet",
  amount: 1.0,
  fee: 0.00005,
  creditedAmount: 0.99995,
  status: "completed",
  createdAt: Date
}
```

## Test Mode

With `SOLANA_TEST_MODE=true`:
- Wallet generation returns fake addresses
- All transactions simulated (no blockchain calls)
- Instant confirmations

## Files Created/Modified

### Created Files:
- `frontend/components/wallet-deposit-panel.tsx` - Deposit UI component
- `frontend/app/api/user/profile/route.ts` - Profile endpoint
- `frontend/app/api/wallet/deposit/route.ts` - Deposit endpoint

### Modified Files:
- `backend/server/pkg/solana_wallet.go` - Added `GenerateNewWallet()`
- `frontend/app/api/auth/signup/route.ts` - Generate wallet on signup
- `frontend/app/settings/page.tsx` - Show wallet & deposit/withdraw UI
- `frontend/app/api/withdraw/route.ts` - Accept optional wallet address
- `frontend/app/page.tsx` - Added wallet deposit panel

## How to Test

### 1. Start Backend (Test Mode)
```powershell
cd backend/server
$env:SOLANA_TEST_MODE="true"
go run .
```

### 2. Start Frontend
```powershell
cd frontend
npm run dev
```

### 3. Test Workflow
1. **Sign up** - New wallet created automatically
2. **Go to Settings** - See your wallet address
3. **Click "Deposit to App"** - Adds fake SOL
4. **Enter withdraw amount** - Withdraw to your wallet (or other address)
5. **Check balance** - Updates in real-time

## Security Notes

⚠️ **Current Implementation (Test Mode Only)**
- Wallets stored in MongoDB
- Secrets not encrypted
- Suitable for hackathon/testing only

🔒 **For Production**
- Store keypairs in AWS KMS or HashiCorp Vault
- Never store secrets in plaintext
- Implement transaction signing with HSM
- Add withdrawal approval queue
- Add rate limiting
- Implement transaction monitoring

## Key Features

✅ Each user has their own wallet
✅ Deposit SOL from personal wallet to app  
✅ Withdraw SOL from app to personal wallet
✅ View wallet address in Settings
✅ Real-time balance updates
✅ Test mode for development
✅ Transaction history (MongoDB)
✅ Network fees applied (0.00005 SOL)

## Next Steps

1. Replace test mode with real Solana devnet
2. Fund the treasury wallet with devnet SOL
3. Implement wallet balance queries from on-chain
4. Add transaction verification
5. Production hardening (vault, HSM, etc.)
