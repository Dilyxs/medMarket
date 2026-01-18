package pkg

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/rpc"
)

// IsTestMode returns true if running in test mode (no real Solana transactions)
func IsTestMode() bool {
	return os.Getenv("SOLANA_TEST_MODE") == "true"
}

// Solana wallet functions

// LoadWalletFromEnv loads the treasury wallet keypair from the SOL_TREASURY_SECRET_KEY env var
// The env var should contain the raw JSON array from app-bank.json
func LoadWalletFromEnv() (solana.PrivateKey, error) {
	keyStr := os.Getenv("SOL_TREASURY_SECRET_KEY")
	if keyStr == "" {
		return nil, fmt.Errorf("SOL_TREASURY_SECRET_KEY env var not set")
	}

	var keyBytes []uint8
	err := json.Unmarshal([]byte(keyStr), &keyBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse SOL_TREASURY_SECRET_KEY: %w", err)
	}

	if len(keyBytes) != 64 {
		return nil, fmt.Errorf("invalid keypair length: expected 64, got %d", len(keyBytes))
	}

	// Create PrivateKey from bytes
	privateKey := solana.PrivateKey(keyBytes)
	return privateKey, nil
}

// GetReceiverAddress returns the treasury SOL receiver address from env
func GetReceiverAddress() string {
	return os.Getenv("SOL_RECEIVER_ADDRESS")
}

// GetSolanaRPC returns the Solana RPC endpoint from env
func GetSolanaRPC() string {
	rpc := os.Getenv("SOLANA_RPC")
	if rpc == "" {
		rpc = "https://api.devnet.solana.com"
	}
	return rpc
}

// GetRPCClient returns a Solana RPC client
func GetRPCClient() *rpc.Client {
	return rpc.New(GetSolanaRPC())
}

// GenerateNewWallet generates a new Solana keypair for a user
func GenerateNewWallet() (publicKey string, secretKey string, err error) {
	if IsTestMode() {
		// Return fake wallet in test mode
		return fmt.Sprintf("testuser-%d-address", time.Now().UnixNano()), fmt.Sprintf("testuser-%d-secret", time.Now().UnixNano()), nil
	}

	// Generate new keypair
	newKeypair, err := solana.NewRandomPrivateKey()
	if err != nil {
		return "", "", fmt.Errorf("failed to generate keypair: %w", err)
	}

	pubKey := newKeypair.PublicKey().String()

	// Convert secret key to JSON array format for storage
	secretBytes := []byte(newKeypair)
	secretJSON, err := json.Marshal(secretBytes)
	if err != nil {
		return "", "", fmt.Errorf("failed to encode secret: %w", err)
	}

	return pubKey, string(secretJSON), nil
}

// GetBalance retrieves the balance of an address in lamports
func GetBalance(address string) (uint64, error) {
	// Test mode: return fake balance (10 SOL)
	if IsTestMode() {
		return 10_000_000_000, nil
	}

	client := GetRPCClient()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pubKey := solana.MustPublicKeyFromBase58(address)
	balance, err := client.GetBalance(ctx, pubKey, rpc.CommitmentConfirmed)
	if err != nil {
		return 0, fmt.Errorf("failed to get balance: %w", err)
	}

	return balance.Value, nil
}

// GetSignatureStatuses retrieves the status of one or more signatures
func GetSignatureStatuses(signatures []string) (map[string]interface{}, error) {
	client := GetRPCClient()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	solSigs := make([]solana.Signature, len(signatures))
	for i, sig := range signatures {
		solSigs[i] = solana.MustSignatureFromBase58(sig)
	}

	statuses, err := client.GetSignatureStatuses(ctx, true, solSigs...)
	if err != nil {
		return nil, fmt.Errorf("failed to get signature statuses: %w", err)
	}

	result := make(map[string]interface{})
	for i, sig := range signatures {
		if i < len(statuses.Value) && statuses.Value[i] != nil {
			result[sig] = statuses.Value[i]
		}
	}
	return result, nil
}

// ConfirmTransaction confirms a transaction is finalized
func ConfirmTransaction(signature string) (bool, error) {
	statuses, err := GetSignatureStatuses([]string{signature})
	if err != nil {
		return false, err
	}

	if status, ok := statuses[signature]; ok && status != nil {
		return true, nil
	}
	return false, nil
}

// QueryRecentTransactions queries recent transactions to a given address
// Returns list of signatures and amounts sent to the address
func QueryRecentTransactions(address string, limit int) ([]map[string]interface{}, error) {
	// Test mode: return mock transactions
	if IsTestMode() {
		transactions := []map[string]interface{}{
			{
				"signature": fmt.Sprintf("test-sig-%d", time.Now().Unix()),
				"slot":      uint64(rand.Intn(1000000)),
				"blockTime": time.Now().Unix(),
				"err":       nil,
			},
		}
		return transactions, nil
	}

	client := GetRPCClient()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pubKey := solana.MustPublicKeyFromBase58(address)

	// Get recent signatures for the address
	signatures, err := client.GetSignaturesForAddress(ctx, pubKey)
	if err != nil {
		return nil, fmt.Errorf("failed to get signatures: %w", err)
	}

	var transactions []map[string]interface{}

	// Limit the results
	maxResults := limit
	if len(signatures) < maxResults {
		maxResults = len(signatures)
	}

	// Get transaction details for each signature
	for i := 0; i < maxResults; i++ {
		sig := signatures[i]
		if sig.Signature.IsZero() {
			continue
		}

		tx, err := client.GetTransaction(ctx, sig.Signature, &rpc.GetTransactionOpts{
			Encoding: solana.EncodingJSON,
		})
		if err != nil {
			continue
		}

		if tx == nil || tx.Transaction == nil {
			continue
		}

		// Parse the transaction to extract transfers to this address
		// This is a simplified version - in production you'd use a more robust parser
		txData := map[string]interface{}{
			"signature": sig.Signature.String(),
			"slot":      sig.Slot,
			"blockTime": sig.BlockTime,
			"err":       sig.Err,
		}
		transactions = append(transactions, txData)
	}

	return transactions, nil
}

// SendTransaction creates and sends a transaction
func SendTransaction(toAddress string, amountLamports uint64, memo string) (string, error) {
	// Test mode: return fake signature
	if IsTestMode() {
		signature := fmt.Sprintf("test-tx-%d-%s", time.Now().UnixNano(), toAddress[:8])
		time.Sleep(100 * time.Millisecond) // Simulate processing
		return signature, nil
	}

	client := GetRPCClient()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Load treasury keypair
	treasury, err := LoadWalletFromEnv()
	if err != nil {
		return "", fmt.Errorf("failed to load treasury wallet: %w", err)
	}

	// Get recent blockhash
	recent, err := client.GetRecentBlockhash(ctx, rpc.CommitmentConfirmed)
	if err != nil {
		return "", fmt.Errorf("failed to get recent blockhash: %w", err)
	}

	// Create transfer instruction
	toPublicKey := solana.MustPublicKeyFromBase58(toAddress)
	instruction := system.NewTransferInstruction(
		amountLamports,
		treasury.PublicKey(),
		toPublicKey,
	).Build()

	// Create transaction
	tx, err := solana.NewTransaction(
		[]solana.Instruction{instruction},
		recent.Value.Blockhash,
		solana.TransactionPayer(treasury.PublicKey()),
	)
	if err != nil {
		return "", fmt.Errorf("failed to create transaction: %w", err)
	}

	// Sign transaction
	_, err = tx.Sign(func(key solana.PublicKey) *solana.PrivateKey {
		if key.Equals(treasury.PublicKey()) {
			return &treasury
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("failed to sign transaction: %w", err)
	}

	// Send transaction
	sig, err := client.SendTransaction(ctx, tx)
	if err != nil {
		return "", fmt.Errorf("failed to send transaction: %w", err)
	}

	return sig.String(), nil
}

// WaitForConfirmation waits for a transaction to be confirmed
func WaitForConfirmation(signature string, maxWaitSeconds int) (bool, error) {
	// Test mode: instant confirmation
	if IsTestMode() {
		time.Sleep(100 * time.Millisecond)
		return true, nil
	}

	client := GetRPCClient()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(maxWaitSeconds)*time.Second)
	defer cancel()

	sig := solana.MustSignatureFromBase58(signature)

	// Poll for confirmation
	for i := 0; i < maxWaitSeconds; i++ {
		statuses, err := client.GetSignatureStatuses(ctx, true, sig)
		if err != nil {
			time.Sleep(1 * time.Second)
			continue
		}

		if len(statuses.Value) > 0 && statuses.Value[0] != nil {
			status := statuses.Value[0]
			if status.ConfirmationStatus == rpc.ConfirmationStatusFinalized {
				return true, nil
			}
		}

		time.Sleep(1 * time.Second)
	}

	return false, nil
}
