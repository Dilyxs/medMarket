package pkg

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const SolanaRPC = "https://api.mainnet-beta.solana.com"

type VerifyDepositRequest struct {
	Signature        string `json:"signature"`
	ExpectedLamports int64  `json:"expected_lamports"`
	Receiver         string `json:"receiver"`
	UserWallet       string `json:"user_wallet"`
}

type SolanaRPCRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

type SolanaRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result"`
	Error   *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	ID int `json:"id"`
}

type SignatureStatus struct {
	Slot               int64   `json:"slot"`
	Confirmations      *int    `json:"confirmations"`
	Err                *string `json:"err"`
	ConfirmationStatus string  `json:"confirmationStatus"`
}

type TransactionResponse struct {
	Slot        int64 `json:"slot"`
	Transaction struct {
		Message struct {
			AccountKeys []interface{} `json:"accountKeys"`
		} `json:"message"`
	} `json:"transaction"`
	Meta struct {
		PreBalances  []int64 `json:"preBalances"`
		PostBalances []int64 `json:"postBalances"`
	} `json:"meta"`
}

func rpcCall(method string, params []interface{}) (json.RawMessage, error) {
	reqBody := SolanaRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(SolanaRPC, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var rpcResp SolanaRPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, err
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC error: %s", rpcResp.Error.Message)
	}

	return rpcResp.Result, nil
}

func VerifyDeposit(w http.ResponseWriter, r *http.Request) {
	// CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req VerifyDepositRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 1) Check signature status (confirmed/finalized)
	statusResult, err := rpcCall("getSignatureStatuses", []interface{}{
		[]string{req.Signature},
		map[string]interface{}{"searchTransactionHistory": true},
	})
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to get signature status: %v", err), http.StatusInternalServerError)
		return
	}

	var statusData struct {
		Value []*SignatureStatus `json:"value"`
	}
	if err := json.Unmarshal(statusResult, &statusData); err != nil {
		respondError(w, "Failed to parse status", http.StatusInternalServerError)
		return
	}

	if len(statusData.Value) == 0 || statusData.Value[0] == nil {
		respondError(w, "Transaction not found", http.StatusBadRequest)
		return
	}

	status := statusData.Value[0]
	if status.ConfirmationStatus != "confirmed" && status.ConfirmationStatus != "finalized" {
		respondError(w, "Transaction not confirmed yet", http.StatusBadRequest)
		return
	}

	if status.Err != nil {
		respondError(w, "Transaction failed on-chain", http.StatusBadRequest)
		return
	}

	// 2) Fetch transaction details
	txResult, err := rpcCall("getTransaction", []interface{}{
		req.Signature,
		map[string]interface{}{
			"encoding":                       "jsonParsed",
			"maxSupportedTransactionVersion": 0,
		},
	})
	if err != nil {
		respondError(w, fmt.Sprintf("Failed to get transaction: %v", err), http.StatusInternalServerError)
		return
	}

	var tx TransactionResponse
	if err := json.Unmarshal(txResult, &tx); err != nil {
		respondError(w, "Failed to parse transaction", http.StatusInternalServerError)
		return
	}

	// 3) Extract account keys and find receiver index
	accountKeys := make([]string, len(tx.Transaction.Message.AccountKeys))
	for i, key := range tx.Transaction.Message.AccountKeys {
		switch v := key.(type) {
		case string:
			accountKeys[i] = v
		case map[string]interface{}:
			if pubkey, ok := v["pubkey"].(string); ok {
				accountKeys[i] = pubkey
			}
		}
	}

	receiverIndex := -1
	for i, key := range accountKeys {
		if key == req.Receiver {
			receiverIndex = i
			break
		}
	}

	if receiverIndex == -1 {
		respondError(w, "Receiver address not found in transaction", http.StatusBadRequest)
		return
	}

	// 4) Check balance delta
	preBal := tx.Meta.PreBalances[receiverIndex]
	postBal := tx.Meta.PostBalances[receiverIndex]
	delta := postBal - preBal

	if delta < req.ExpectedLamports {
		respondError(w, fmt.Sprintf("Amount too low: got %d lamports, expected %d", delta, req.ExpectedLamports), http.StatusBadRequest)
		return
	}

	// 5) Verify sender (optional but recommended)
	if len(accountKeys) > 0 && accountKeys[0] != req.UserWallet {
		respondError(w, "Sender wallet mismatch", http.StatusBadRequest)
		return
	}

	// 6) TODO: Store signature in DB to prevent replay attacks
	// For now, just return success
	// Example: INSERT INTO deposits (signature, user_wallet, lamports, created_at) VALUES (?, ?, ?, NOW())
	// WITH unique constraint on signature column

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":                true,
		"credited_lamports": delta,
		"signature":         req.Signature,
	})
}

func respondError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
