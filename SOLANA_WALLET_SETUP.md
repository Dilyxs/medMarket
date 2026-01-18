# Solana Wallet Setup for MedMarket

## Step 1: Generate Wallet

Run this in your terminal:

```bash
solana-keygen new --outfile app-bank.json
```

When prompted for a passphrase, just press Enter to skip (hackathon mode).

## Step 2: Get Your Public Address

```bash
solana-keygen pubkey app-bank.json
```

Copy the output address. This is your `SOL_RECEIVER_ADDRESS`.

## Step 3: Airdrop Test SOL (Devnet Only)

```bash
solana airdrop 10 app-bank.json --url devnet
```

You now have 10 SOL on devnet to test with.

## Step 4: Store Wallet Securely

The `app-bank.json` file is your private key. Add it to `.gitignore`:

```bash
echo "app-bank.json" >> .gitignore
```

## Step 5: Get Wallet Contents

Print the full contents to paste into `.env`:

```bash
cat app-bank.json
```

This will show an array like `[123, 45, 67, ...]`. Paste this entire JSON array as your `SOL_TREASURY_SECRET_KEY`.

## Step 6: Update Env Files

See `.env.example` files in `frontend/` and `backend/` directories.
