package cryptostuff

import (
	"fmt"

	"github.com/gagliardetto/solana-go"
)

func Setaccount() {
	account := solana.NewWallet()
	fmt.Println("My Public Key:", account.PublicKey())
	fmt.Println("My Private Key:", account.PrivateKey)
}
