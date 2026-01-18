package main

import (
	"fmt"
	"math/rand"
	"net/http"

	"github.com/dilyxs/medMarket/pkg"
)

func main() {
	broadcastServerHub := pkg.NewBroadcastServerHub()
	go broadcastServerHub.StartHubWork()

	// Chat hub
	chatHub := pkg.NewChatHub()
	go chatHub.Start()

	http.HandleFunc("/broadcaster", func(w http.ResponseWriter, r *http.Request) {
		pkg.ConnectBroadCaster(broadcastServerHub, w, r)
	})
	http.HandleFunc("/viewer", func(w http.ResponseWriter, r *http.Request) {
		// could ask user for an ID, now for random generate it, later add OAuth
		id := rand.Intn(100000000)
		pkg.AddNewUserViewerToHub(broadcastServerHub, w, r, id)
	})
	http.HandleFunc("/chat", func(w http.ResponseWriter, r *http.Request) {
		clientID := fmt.Sprintf("client-%d-%d", rand.Intn(1000000), rand.Intn(1000000))
		pkg.AddChatClient(chatHub, w, r, clientID)
	})
	http.HandleFunc("/verify_deposit", pkg.VerifyDeposit)

	fmt.Println("medMarket backend server running on :8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		fmt.Printf("Server error: %v\n", err)
	}
}
