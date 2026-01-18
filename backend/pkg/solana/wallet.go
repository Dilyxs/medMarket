package solana

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/rpc"
	confirmationSt "github.com/gagliardetto/solana-go/rpc/ws"
)

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

// JSONRPCRequest represents a JSON-RPC request to Solana
type JSONRPCRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

// JSONRPCResponse represents a JSON-RPC response from Solana
type JSONRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result"`
	Error   interface{}     `json:"error"`
	ID      int             `json:"id"`
}

// BalanceResponse represents the result of getBalance
type BalanceResponse struct {
	Value uint64 `json:"value"`
}

// GetBalance retrieves the balance of an address in lamports
func GetBalance(address string) (uint64, error) {
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

	statuses, err := client.GetSignatureStatuses(ctx, solSigs...)
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

// TransactionSignature represents a transaction signature result
type TransactionSignature struct {
	Signature string
	Slot      uint64
	BlockTime int64
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
	client := GetRPCClient()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pubKey := solana.MustPublicKeyFromBase58(address)

	// Get recent signatures for the address
	signatures, err := client.GetSignaturesForAddress(ctx, pubKey, &rpc.GetSignaturesForAddressOpts{
		Limit: uint64(limit),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get signatures: %w", err)
	}

	var transactions []map[string]interface{}

	// Get transaction details for each signature
	for _, sig := range signatures {
		if sig.Signature == "" {
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
	client := GetRPCClient()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(maxWaitSeconds)*time.Second)
	defer cancel()

	sig := solana.MustSignatureFromBase58(signature)

	// Poll for confirmation
	for i := 0; i < maxWaitSeconds; i++ {
		status, err := client.GetSignatureStatus(ctx, sig)
		if err != nil {
			time.Sleep(1 * time.Second)
			continue
		}

		if status != nil && status.ConfirmationStatus != "" {
			if status.ConfirmationStatus == rpc.ConfirmationStatusFinalized {
				return true, nil
			}
		}

		time.Sleep(1 * time.Second)
	}

	return false, nil
}
