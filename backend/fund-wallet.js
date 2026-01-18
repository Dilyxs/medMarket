const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

async function fundWallet() {
  const publicKey = new PublicKey('Dy33yxHZhbEMmdRk3CkK1bEngHBRZLxP7rD9nAAejE7L');
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  console.log('\n💰 Requesting Devnet Airdrop...\n');
  
  try {
    // Request airdrop (2 SOL)
    const signature = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
    console.log('✅ Airdrop requested! Signature:', signature);
    
    // Wait for confirmation
    await connection.confirmTransaction(signature);
    console.log('✅ Transaction confirmed!');
    
    // Check balance
    const balance = await connection.getBalance(publicKey);
    console.log(`\n💎 Current Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);
    console.log('🎉 Treasury wallet is funded and ready!\n');
  } catch (error) {
    console.error('❌ Airdrop failed:', error.message);
    console.log('\n💡 Try again in a few seconds (rate limit) or visit:');
    console.log('   https://faucet.solana.com/');
  }
}

fundWallet();
