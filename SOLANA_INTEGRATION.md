# Solana Integration - Complete Setup Guide

## ✅ Implementation Status

### Backend (Go)
- ✅ Solana wallet functions (`server/pkg/solana_wallet.go`)
  - LoadWalletFromEnv() - Load treasury keypair
  - QueryRecentTransactions() - Check deposits
  - SendTransaction() - Send SOL withdrawals
  - GetBalance() - Query on-chain balance
- ✅ HTTP endpoints (`server/solana_routes.go`)
  - GET /api/deposit - Returns treasury address
  - POST /api/deposit - Checks for deposits
  - POST /api/withdraw - Processes withdrawals
  - POST /api/unlock-assistant - Charges 0.4 SOL
- ✅ MongoDB integration in main.go
- ✅ Routes registered with gorilla/mux

### Frontend (Next.js)
- ✅ API route: `/api/unlock-assistant` - Deducts 0.4 SOL from user balance
- ✅ Page integration: `handleUnlockAssistant()` calls API
- ✅ Existing deposit/withdraw UI integrated

## 🔧 Environment Setup

### Backend (.env in `backend/`)
```env
# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
MONGODB_DB=db

# Solana Treasury Wallet
SOL_RECEIVER_ADDRESS=<your_treasury_public_key>
SOL_TREASURY_SECRET_KEY=<json_array_from_wallet_file>
SOLANA_RPC=https://api.devnet.solana.com
```

### Generate Solana Wallet
```bash
# Install Solana CLI
solana-keygen new --outfile app-bank.json

# Get public key
solana-keygen pubkey app-bank.json
# Copy this to SOL_RECEIVER_ADDRESS

# Get private key (JSON array)
cat app-bank.json
# Copy the entire array to SOL_TREASURY_SECRET_KEY
```

### Fund Devnet Wallet
```bash
solana airdrop 2 <your_public_key> --url devnet
```

## 🚀 Running the Application

### Terminal 1 - Go Backend
```bash
cd backend/server
go run main.go
```

Should see:
```
Connected to MongoDB
medMarket backend server running on :8080
```

### Terminal 2 - Next.js Frontend
```bash
cd frontend
npm run dev
```

Visit: http://localhost:3000

## 💰 User Flow

### 1. Deposit SOL
- User connects Phantom wallet
- Sends SOL to treasury address
- Backend verifies transaction on-chain
- Credits user's MongoDB balance

### 2. Unlock AI Assistant (0.4 SOL)
- User clicks "Unlock for 0.40 SOL"
- Frontend calls `/api/unlock-assistant`
- Deducts 0.4 SOL from user balance
- Sets `assistant_unlocked_at` timestamp

### 3. Withdraw SOL
- User requests withdrawal
- Backend signs transaction with treasury key
- Sends SOL to user's wallet
- Deducts from user balance + fee

## 📊 MongoDB Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  email: string,
  passwordHash: string,
  name: string,
  balance: number,  // SOL balance
  assistant_unlocked_at: Date,
  assistant_purchases: number,
  created_at: Date,
  updated_at: Date
}
```

### Deposits Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  signature: string,  // Unique transaction signature
  walletAddress: string,
  amount: number,  // SOL amount
  status: string,  // "completed", "pending"
  createdAt: Date
}
```

### Withdrawals Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  amount: number,
  walletAddress: string,
  signature: string,  // Transaction signature
  status: string,  // "pending", "completed", "failed"
  createdAt: Date
}
```

## 🔒 Security Notes

### ✅ Implemented
- Session-based authentication
- Balance validation before transactions
- Signature replay protection (deposits collection)
- On-chain transaction verification
- CORS enabled for API access

### ⚠️ For Production
- [ ] Move treasury key to secure key management (AWS KMS, HashiCorp Vault)
- [ ] Add rate limiting to prevent spam
- [ ] Implement withdrawal queue with manual approval
- [ ] Add transaction monitoring and alerts
- [ ] Use mainnet instead of devnet
- [ ] Add minimum deposit amounts
- [ ] Implement multi-sig for large withdrawals

## 🧪 Testing Checklist

- [ ] Generate devnet wallet and fund it
- [ ] Set environment variables
- [ ] Start backend (MongoDB connection succeeds)
- [ ] Start frontend
- [ ] User signs up/logs in
- [ ] User deposits SOL (verify balance increases)
- [ ] User unlocks assistant (verify 0.4 SOL deducted)
- [ ] User attempts unlock without balance (verify error)
- [ ] User withdraws SOL (verify transaction sent)

## 📝 API Endpoints

### Next.js Frontend APIs
- `POST /api/unlock-assistant` - Charge 0.4 SOL
- `POST /api/deposit` - Record deposit
- `POST /api/withdraw` - Request withdrawal
- `GET /api/balance` - Get user balance

### Go Backend APIs
- `GET /api/deposit` - Get treasury address
- `POST /api/deposit` - Check pending deposits
- `POST /api/withdraw` - Process withdrawal
- `POST /api/unlock-assistant` - Charge for unlock

## 🎯 Next Steps

1. Generate Solana wallet for treasury
2. Configure environment variables
3. Test deposit flow
4. Test unlock assistant flow
5. Test withdrawal flow
6. Monitor transactions on Solana Explorer
