package cryptostuff

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/joho/godotenv"
)

func LoadServerAccount() *solana.Wallet {
	godotenv.Load()
	solana_Private_key := os.Getenv("SOLANA_PRIVATE")
	ServerAccountPass, err := solana.WalletFromPrivateKeyBase58(solana_Private_key)
	if err != nil {
		log.Fatalf("cannot load server account!")
	}
	return ServerAccountPass
}

func TransferFunds(AddressTargetString string, quantity int) {
	client := rpc.New(rpc.DevNet_RPC)
	senderWallet := LoadServerAccount()
	receiverPubKey, err := solana.PublicKeyFromBase58(AddressTargetString)
	if err != nil {
		log.Fatalf("Invalid receiver address: %v", err)
	}

	recent, err := client.GetLatestBlockhash(context.TODO(), rpc.CommitmentFinalized)
	if err != nil {
		log.Panicf("error getting blockhash: %v", err)
	}

	tx, err := solana.NewTransaction(
		[]solana.Instruction{
			system.NewTransferInstruction(
				uint64(solana.LAMPORTS_PER_SOL*uint64(quantity)),
				senderWallet.PublicKey(), // From
				receiverPubKey,           // To
			).Build(),
		},
		recent.Value.Blockhash,
		solana.TransactionPayer(senderWallet.PublicKey()),
	)
	if err != nil {
		log.Panic(err)
	}

	_, err = tx.Sign(
		func(key solana.PublicKey) *solana.PrivateKey {
			if senderWallet.PublicKey().Equals(key) {
				return &senderWallet.PrivateKey
			}
			return nil
		},
	)
	if err != nil {
		log.Panic(err)
	}

	sig, err := client.SendTransactionWithOpts(
		context.TODO(),
		tx,
		rpc.TransactionOpts{
			PreflightCommitment: rpc.CommitmentFinalized,
		},
	)
	if err != nil {
		log.Panic(err)
	}

	fmt.Println("Transfer sent! Signature:", sig)
}
