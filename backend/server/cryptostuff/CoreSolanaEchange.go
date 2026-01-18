package cryptostuff

import (
	"log"
	"os"

	"github.com/gagliardetto/solana-go"
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

func TransferFunds(AddressTargetString string) {
}
