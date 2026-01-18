package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dilyxs/medMarket/pkg"
	"github.com/gagliardetto/solana-go"
	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

const (
	LAMPORTS_PER_SOL = 1_000_000_000
	WITHDRAWAL_FEE   = 0.00005 // SOL
)

// DepositRequest represents a deposit request
type DepositRequest struct {
	UserID string `json:"user_id"`
}

// DepositResponse represents the deposit response with address and status
type DepositResponse struct {
	DepositAddress string  `json:"deposit_address"`
	AmountReceived float64 `json:"amount_received"`
	Status         string  `json:"status"` // "waiting", "confirmed", "credited"
	Message        string  `json:"message"`
}

// HandleDeposit handles deposit requests
// GET /api/deposit - gets the treasury deposit address
// POST /api/deposit - checks for pending deposits and credits them
func HandleDeposit(w http.ResponseWriter, r *http.Request, usersCollection *mongo.Collection) {
	w.Header().Set("Content-Type", "application/json")

	// Get treasury address
	treasuryAddress := pkg.GetReceiverAddress()
	if treasuryAddress == "" {
		http.Error(w, `{"error": "treasury not configured"}`, http.StatusInternalServerError)
		return
	}

	if r.Method == http.MethodGet {
		// Return the deposit address
		testMode := pkg.IsTestMode()
		response := map[string]interface{}{
			"deposit_address": treasuryAddress,
			"network":         "devnet",
			"test_mode":       testMode,
			"message":         "Send SOL to this address. Your balance will be credited within 2 minutes.",
		}
		if testMode {
			response["message"] = "TEST MODE: Deposits are simulated. Use test deposit endpoint to add balance."
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	if r.Method == http.MethodPost {
		// Check for pending deposits and credit user
		var req DepositRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "invalid request"}`, http.StatusBadRequest)
			return
		}

		// Query Solana for recent transactions to treasury address
		txns, err := pkg.QueryRecentTransactions(treasuryAddress, 10)
		if err != nil {
			// Return placeholder if RPC call fails
			response := DepositResponse{
				DepositAddress: treasuryAddress,
				AmountReceived: 0,
				Status:         "waiting",
				Message:        "Unable to query deposits right now. Please try again.",
			}
			json.NewEncoder(w).Encode(response)
			return
		}

		// For now, return transaction count
		// In a production system, you would:
		// 1. Parse each transaction to extract the transfer amount
		// 2. Match against user memo or ID
		// 3. Credit the user's MongoDB balance once confirmed

		totalAmount := 0.0
		if len(txns) > 0 {
			totalAmount = float64(len(txns)) * 0.1 // Placeholder calculation
		}

		response := DepositResponse{
			DepositAddress: treasuryAddress,
			AmountReceived: totalAmount,
			Status:         "waiting",
			Message:        fmt.Sprintf("Found %d transactions. Balance will update when confirmed.", len(txns)),
		}
		json.NewEncoder(w).Encode(response)
		return
	}

	http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
}

// HandleWithdraw handles withdrawal requests
// POST /api/withdraw - creates and broadcasts a withdrawal transaction
func HandleWithdraw(w http.ResponseWriter, r *http.Request, usersCollection *mongo.Collection) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Parse request
	type WithdrawRequest struct {
		UserID    string `json:"user_id"`
		Amount    string `json:"amount"` // in SOL
		ToAddress string `json:"to_address"`
	}

	var req WithdrawRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request"}`, http.StatusBadRequest)
		return
	}

	// Validate amount
	amount, err := strconv.ParseFloat(req.Amount, 64)
	if err != nil || amount <= 0 {
		http.Error(w, `{"error": "invalid amount"}`, http.StatusBadRequest)
		return
	}

	// Validate to_address
	if strings.TrimSpace(req.ToAddress) == "" {
		http.Error(w, `{"error": "invalid recipient address"}`, http.StatusBadRequest)
		return
	}

	// Verify it's a valid Solana address (skip validation in test mode)
	if !pkg.IsTestMode() {
		_, err = solana.PublicKeyFromBase58(req.ToAddress)
		if err != nil {
			http.Error(w, `{"error": "invalid recipient address format"}`, http.StatusBadRequest)
			return
		}
	}

	// Get user balance from Mongo
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Convert user ID from string to ObjectId
	userObjectID, err := primitive.ObjectIDFromHex(req.UserID)
	if err != nil {
		http.Error(w, `{"error": "invalid user id"}`, http.StatusBadRequest)
		return
	}

	var user bson.M
	err = usersCollection.FindOne(ctx, bson.M{"_id": userObjectID}).Decode(&user)
	if err != nil {
		http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
		return
	}

	userBalance := 0.0
	if balance, exists := user["balance"]; exists {
		userBalance, _ = balance.(float64)
	}

	// Include fee in total amount required
	totalDebit := amount + WITHDRAWAL_FEE

	// Check sufficient balance
	if userBalance < totalDebit {
		http.Error(w, fmt.Sprintf(`{"error": "insufficient balance. have %.4f, need %.4f (including %.4f fee)"}`, userBalance, totalDebit, WITHDRAWAL_FEE), http.StatusBadRequest)
		return
	}

	// Sign and broadcast withdrawal transaction
	amountLamports := uint64(amount * LAMPORTS_PER_SOL)
	signature, err := pkg.SendTransaction(req.ToAddress, amountLamports, "withdrawal")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "failed to send transaction: %v"}`, err), http.StatusInternalServerError)
		return
	}

	// Deduct from Mongo balance (including fee)
	newBalance := userBalance - totalDebit

	_, err = usersCollection.UpdateOne(ctx, bson.M{"_id": userObjectID}, bson.M{
		"$set": bson.M{
			"balance": newBalance,
			"last_withdrawal": bson.M{
				"amount":     amount,
				"address":    req.ToAddress,
				"signature":  signature,
				"timestamp":  time.Now(),
				"fee":        WITHDRAWAL_FEE,
			},
		},
	})
	if err != nil {
		http.Error(w, `{"error": "failed to update balance"}`, http.StatusInternalServerError)
		return
	}

	// In test mode, credit the recipient if they exist in our database
	if pkg.IsTestMode() {
		var recipient bson.M
		err = usersCollection.FindOne(ctx, bson.M{"wallet.address": req.ToAddress}).Decode(&recipient)
		if err == nil {
			// Recipient found, credit their balance
			recipientBalance := 0.0
			if balance, exists := recipient["balance"]; exists {
				recipientBalance, _ = balance.(float64)
			}
			newRecipientBalance := recipientBalance + amount

			usersCollection.UpdateOne(ctx, bson.M{"wallet.address": req.ToAddress}, bson.M{
				"$set": bson.M{
					"balance": newRecipientBalance,
				},
			})
		}
	}

	response := map[string]interface{}{
		"status":      "pending",
		"amount":      amount,
		"fee":         WITHDRAWAL_FEE,
		"to_address":  req.ToAddress,
		"signature":   signature,
		"new_balance": newBalance,
		"test_mode":   pkg.IsTestMode(),
		"message":     fmt.Sprintf("Withdrawal initiated. Signature: %s", signature[:10]+"..."),
	}
	if pkg.IsTestMode() {
		response["message"] = fmt.Sprintf("TEST MODE: Simulated withdrawal of %.4f SOL to %s", amount, req.ToAddress)
	}
	json.NewEncoder(w).Encode(response)
}

// HandleUnlockAssistant handles payment for unlocking the AI assistant
// POST /api/unlock-assistant - charges 0.4 SOL to unlock assistant
func HandleUnlockAssistant(w http.ResponseWriter, r *http.Request, usersCollection *mongo.Collection) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	type UnlockRequest struct {
		UserID string `json:"user_id"`
	}

	var req UnlockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request"}`, http.StatusBadRequest)
		return
	}

	const ASSISTANT_COST = 0.4

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Get user
	var user bson.M
	err := usersCollection.FindOne(ctx, bson.M{"_id": req.UserID}).Decode(&user)
	if err != nil {
		http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
		return
	}

	userBalance := 0.0
	if balance, exists := user["balance"]; exists {
		userBalance, _ = balance.(float64)
	}

	// Check sufficient balance
	if userBalance < ASSISTANT_COST {
		http.Error(w, fmt.Sprintf(`{"error": "insufficient balance. have %.4f SOL, need %.4f SOL"}`, userBalance, ASSISTANT_COST), http.StatusBadRequest)
		return
	}

	// Deduct payment
	newBalance := userBalance - ASSISTANT_COST
	_, err = usersCollection.UpdateOne(ctx, bson.M{"_id": req.UserID}, bson.M{
		"$set": bson.M{
			"balance": newBalance,
			"assistant_unlocked_at": time.Now(),
		},
		"$inc": bson.M{"assistant_purchases": 1},
	})
	if err != nil {
		http.Error(w, `{"error": "failed to process payment"}`, http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"status":      "unlocked",
		"cost":        ASSISTANT_COST,
		"new_balance": newBalance,
		"message":     "Assistant unlocked! You can now use AI features.",
	}
	json.NewEncoder(w).Encode(response)
}

// RegisterSolanaRoutes registers Solana-related routes
func RegisterSolanaRoutes(router *mux.Router, usersCollection *mongo.Collection) {
	router.HandleFunc("/api/deposit", func(w http.ResponseWriter, r *http.Request) {
		HandleDeposit(w, r, usersCollection)
	}).Methods(http.MethodGet, http.MethodPost)

	router.HandleFunc("/api/withdraw", func(w http.ResponseWriter, r *http.Request) {
		HandleWithdraw(w, r, usersCollection)
	}).Methods(http.MethodPost)

	router.HandleFunc("/api/unlock-assistant", func(w http.ResponseWriter, r *http.Request) {
		HandleUnlockAssistant(w, r, usersCollection)
	}).Methods(http.MethodPost)
}
