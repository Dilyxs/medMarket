# 🏥 MedMarket

**MedMarket** is a medical education platform that combines live video broadcasting, real-time interactive quizzes, AI-powered video analysis, and blockchain-based payments. The platform enables medical professionals to conduct live educational sessions with audience participation, betting mechanics, and Solana cryptocurrency integration.

[See Devpost/Demo](https://devpost.com/software/1162978)

---

## 🌟 Key Features

### 📺 Live Broadcasting & Streaming
- Real-time video broadcasting with WebSocket support
- Multi-viewer live streaming capabilities
- Interactive live chat during broadcasts
- Support for medical video datasets (Echo, POCUS, Laparoscopy, Intrapartum)

### 🎮 Interactive Quiz System
- Real-time quiz broadcasting to multiple participants
- Live audience participation and scoring
- WebSocket-based quiz delivery
- User performance tracking in MongoDB

### 🤖 AI-Powered Video Analysis
- **SAM3** (Segment Anything Model) integration for medical video segmentation
- Object tracking and bounding box detection
- Frame-by-frame analysis and spatial data extraction
- JSON export of segmentation results
- Optimized for medical imaging (ultrasound, surgical videos)

### 💰 Solana Blockchain Integration
- **Mainnet-ready** cryptocurrency payments
- User wallet creation and management
- Deposit and withdrawal functionality
- AI assistant unlock feature (0.4 SOL)
- Transaction verification on-chain
- Phantom wallet integration

### 💬 Real-Time Chat & Communication
- Live chat during broadcasts
- WebSocket-based messaging
- Multi-user chat rooms
- Real-time message synchronization

### 🎯 Betting & Prediction System
- Interactive betting panel for live events
- Token-based prediction mechanics
- User balance management

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **UI:** React 19, Tailwind CSS 4
- **Real-time:** WebSocket connections
- **Blockchain:** 
  - @solana/web3.js
  - @solana/wallet-adapter-react
  - Phantom Wallet support
- **AI:** OpenAI SDK, Azure OpenAI
- **Auth:** JWT tokens via jose
- **Database Client:** MongoDB driver

### Backend
- **Language:** Go 1.25.6
- **Web Framework:** Gorilla Mux
- **Real-time:** WebSocket hubs for broadcasting, chat, and quizzes
- **Database:** MongoDB (Go driver)
- **Blockchain:** Solana web3 integration
- **Environment:** dotenv for configuration

### AI Service
- **Language:** Python 3.8+
- **Framework:** FastAPI (for API endpoints)
- **ML Model:** Ultralytics SAM3 (Segment Anything Model)
- **Video Processing:** OpenCV, frame-by-frame analysis
- **Output:** JSON-based tracking data

### Database
- **Primary:** MongoDB Atlas
- **Collections:**
  - Users (authentication, balances, profiles)
  - Deposits (Solana transaction records)
  - Withdrawals (payout tracking)
  - Quiz results and scores

---

## 🏗️ Architecture

```
MedMarket/
├── frontend/           # Next.js React application
│   ├── app/            # App router pages and API routes
│   ├── components/     # React components (UI, broadcast, chat, quiz)
│   └── lib/            # Utility functions and helpers
│
├── backend/            # Go server
│   ├── server/         # Main server application
│   │   ├── main.go     # Entry point, WebSocket hubs
│   │   ├── pkg/        # Core packages (chat, quiz, AI client, Solana)
│   │   ├── cryptostuff/ # Solana exchange logic
│   │   └── solana_routes.go # Blockchain API endpoints
│   ├── ai_service/     # Python AI service
│   │   ├── app.py      # SAM3 video segmentation
│   │   └── main.py     # FastAPI server
│   └── database/       # Database migrations
│
└── Dataset/            # Medical video datasets
    ├── Echo/           # Echocardiogram videos
    ├── POCUS/          # Point-of-care ultrasound
    ├── Lapchole/       # Laparoscopic cholecystectomy
    └── Intrapartum/    # Obstetric videos
```

---

## 📋 Prerequisites

- **Node.js** 20+ (for frontend)
- **Go** 1.25+ (for backend server)
- **Python** 3.8+ (for AI service)
- **MongoDB** Atlas account or local instance
- **Solana Wallet** (for blockchain features)
- **Phantom Wallet** browser extension (for users)

---

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone https://github.com/vlrr7/MedMarket.git
cd MedMarket
```

### 2. Backend Setup (Go Server)

```bash
cd backend

# Create .env file
cp .env.example .env

# Edit .env with your configuration:
# MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
# MONGODB_DB=medmarket
# SOL_RECEIVER_ADDRESS=your_solana_public_key
# SOL_TREASURY_SECRET_KEY=[your_secret_key_array]
# SOLANA_RPC=https://api.mainnet-beta.solana.com
# AI_SERVICE_URL=http://localhost:8000

# Run the server
cd server
go run main.go
```

Server will start on `http://localhost:8080`

### 3. Frontend Setup (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file
cat > .env.local << EOF
NEXT_PUBLIC_SOL_RECEIVER=YOUR_SOLANA_WALLET_ADDRESS
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
MONGODB_DB=medmarket
EOF

# Run development server
npm run dev
```

Frontend will be available at `http://localhost:3000`

### 4. AI Service Setup (Python)

```bash
cd backend/ai_service

# Install dependencies
pip install -r requirements.txt

# Run the service
python app.py 706.5,442.5,905.25,555 598,635,725,750
```

AI service runs on `http://localhost:8000`

---

## 💡 Usage

### Quick Start

See [QUICKSTART.md](./QUICKSTART.md) for a 3-step quick start guide.

### For Broadcasters

1. Navigate to `/broadcaster` page
2. Start your video stream
3. Launch interactive quizzes
4. Monitor live chat and viewer engagement

### For Viewers

1. Sign up / Sign in to the platform
2. Connect your Phantom wallet (optional)
3. Deposit SOL to participate in betting
4. Join live broadcasts at `/viewer`
5. Answer quiz questions and earn tokens
6. Chat with other participants

### Solana Integration

#### Deposit Funds
```typescript
// Users connect Phantom wallet
// Send SOL to platform treasury address
// Backend verifies transaction on-chain
// User balance updated in MongoDB
```

#### Unlock AI Assistant (0.4 SOL)
```bash
# Cost: 0.4 SOL per unlock
# Deducted from user balance
# Grants access to AI features
```

#### Withdraw Funds
```bash
# Request withdrawal from user balance
# Backend processes transaction
# SOL sent to user's wallet address
```

For detailed Solana setup, see:
- [SOLANA_SETUP.md](./SOLANA_SETUP.md)
- [SOLANA_INTEGRATION.md](./SOLANA_INTEGRATION.md)
- [PER_USER_WALLET_GUIDE.md](./PER_USER_WALLET_GUIDE.md)

### AI Video Analysis

```bash
# Run video segmentation on medical footage
cd backend/ai_service

# Process video with bounding boxes
python app.py <bbox1> <bbox2> ...

# Example
python app.py 706.5,442.5,905.25,555 598,635,725,750

# Output: segmentation_results.json
```

See [backend/ai_service/README.md](./backend/ai_service/README.md) for details.

---

## 📡 API Endpoints

### Frontend API Routes (Next.js)

#### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

#### User & Profile
- `GET /api/user` - Get user data
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update profile

#### Wallet & Transactions
- `GET /api/balance` - Get user balance
- `POST /api/deposit` - Record deposit
- `POST /api/withdraw` - Request withdrawal
- `POST /api/wallet/create` - Create new wallet
- `POST /api/wallet/regenerate` - Regenerate wallet
- `POST /api/wallet/deposit` - Process deposit

#### Features
- `POST /api/unlock-assistant` - Unlock AI assistant (0.4 SOL)
- `POST /api/bets` - Place bet
- `POST /api/tokens/purchase` - Buy tokens
- `POST /api/chat` - Send chat message

### Backend WebSocket Endpoints (Go)

- `GET /broadcaster` - Connect as broadcaster
- `GET /viewer` - Connect as viewer
- `GET /chat` - Join chat room
- `GET /quiz-broadcaster` - Host quiz
- `GET /quiz-viewer` - Join quiz as participant

### Backend HTTP Endpoints (Go)

#### Solana
- `GET /api/deposit` - Get treasury address
- `POST /api/deposit` - Verify deposit transaction
- `POST /api/withdraw` - Process withdrawal
- `POST /api/unlock-assistant` - Charge for AI unlock

---

## 🗂️ Project Structure

### Key Frontend Components
- `components/live-broadcast.tsx` - Live video viewer
- `components/video-broadcaster.tsx` - Broadcasting interface
- `components/quiz-broadcaster.tsx` - Quiz hosting
- `components/quiz-panel.tsx` - Quiz participation UI
- `components/betting-panel.tsx` - Betting interface
- `components/chat-widget.tsx` - Chat UI
- `components/solana-deposit-card.tsx` - Crypto deposit widget
- `components/wallet-deposit-panel.tsx` - Wallet management

### Key Backend Packages
- `pkg/ChatHub.go` - Chat WebSocket hub
- `pkg/QuizHub.go` - Quiz WebSocket hub
- `pkg/FeedForwarder.go` - Video broadcast hub
- `pkg/ai_client.go` - AI service integration
- `pkg/solana_wallet.go` - Blockchain wallet operations
- `pkg/Questions.go` - Quiz question management

### AI Service
- `app.py` - Main video segmentation script
- `main.py` - FastAPI server (if used)
- `verify_stream.py` - Stream verification
- `client.py` - Client utilities

---

## 🧪 Testing

### Backend Tests
```bash
cd backend/server
go test ./...
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Testing Solana Integration

1. **Set up Devnet** (for testing)
```bash
# Edit app/providers.tsx
const endpoint = "https://api.devnet.solana.com";

# Get devnet SOL
solana airdrop 2 <your_wallet_address> --url devnet
```

2. **Test Deposit Flow**
   - Connect Phantom wallet
   - Switch to devnet in Phantom
   - Send test transaction
   - Verify backend logs

3. **Test Unlock Assistant**
   - Ensure sufficient balance
   - Click unlock button
   - Verify 0.4 SOL deduction

See [QUICKSTART.md](./QUICKSTART.md) for full testing checklist.

---

## 🗄️ Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  email: string,
  passwordHash: string,
  name: string,
  balance: number,              // SOL balance
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
  signature: string,            // Unique Solana tx signature
  walletAddress: string,
  amount: number,
  status: string,               // "completed", "pending"
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
  signature: string,
  status: string,               // "pending", "completed", "failed"
  createdAt: Date
}
```

---

## 🌐 Environment Variables

### Backend (.env in `backend/`)
```env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
MONGODB_DB=medmarket
SOL_RECEIVER_ADDRESS=<treasury_public_key>
SOL_TREASURY_SECRET_KEY=[secret_key_array]
SOLANA_RPC=https://api.mainnet-beta.solana.com
AI_SERVICE_URL=http://localhost:8000
```

### Frontend (.env.local in `frontend/`)
```env
NEXT_PUBLIC_SOL_RECEIVER=<your_solana_wallet_address>
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
MONGODB_DB=medmarket
```

---

## 📚 Documentation

Additional documentation files:
- [QUICKSTART.md](./QUICKSTART.md) - Get started in 3 steps
- [SOLANA_SETUP.md](./SOLANA_SETUP.md) - Complete Solana setup guide
- [SOLANA_INTEGRATION.md](./SOLANA_INTEGRATION.md) - Integration details
- [SOLANA_STATUS.md](./SOLANA_STATUS.md) - Current implementation status
- [SOLANA_WALLET_SETUP.md](./SOLANA_WALLET_SETUP.md) - Wallet configuration
- [PER_USER_WALLET_GUIDE.md](./PER_USER_WALLET_GUIDE.md) - User wallet management
- [API_INTEGRATION.md](./backend/API_INTEGRATION.md) - Backend API details
- [backend/ai_service/README.md](./backend/ai_service/README.md) - AI service docs

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Test thoroughly**
   - Run Go tests
   - Run frontend builds
   - Test on devnet before mainnet
5. **Commit with clear messages**
   ```bash
   git commit -m "Add amazing feature"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Code Style
- **Go:** Follow standard Go conventions, use `gofmt`
- **TypeScript/React:** ESLint configuration included
- **Python:** PEP 8 style guide

---

## 🐛 Troubleshooting

### Common Issues

**"Please connect your wallet first"**
- Install Phantom wallet extension
- Create or import wallet
- Ensure wallet is unlocked

**"Transaction not confirmed yet"**
- Normal behavior - Solana takes 5-10 seconds
- Check Solana Explorer for transaction status

**"Verification failed"**
- Ensure backend is running on port 8080
- Check CORS configuration
- Verify environment variables

**Build errors in Next.js**
```bash
rm -rf .next
npm run dev
```

**MongoDB connection failed**
- Verify MONGODB_URI in .env
- Check MongoDB Atlas IP whitelist
- Ensure database user has correct permissions

**WebSocket connection failed**
- Check backend is running
- Verify port 8080 is accessible
- Check firewall settings

---

## 🙏 Acknowledgments

- **Solana Foundation** - Blockchain infrastructure
- **Ultralytics** - SAM3 AI model
- **MongoDB** - Database platform
- **Next.js Team** - Frontend framework
- **Go Community** - Backend tools and libraries

---
