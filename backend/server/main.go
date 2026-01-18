package main

import (
	"log"
	"math/rand"
	"net/http"
	"os"

	"github.com/dilyxs/medMarket/pkg"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables
	if err := godotenv.Load("../.env"); err != nil {
		log.Printf("Warning: Error loading .env file: %v", err)
	}

	// Get AI service URL from environment (with fallback)
	aiServiceURL := os.Getenv("AI_SERVICE_URL")
	if aiServiceURL == "" {
		aiServiceURL = "http://localhost:8000"
		log.Printf("AI_SERVICE_URL not set, using default: %s", aiServiceURL)
	}

	broadcastServerHub := pkg.NewBroadcastServerHub(aiServiceURL)
	chatHub := pkg.NewChatServerHub()
	chatHub.Run()
	go broadcastServerHub.StartHubWork()

	log.Printf("Starting server on :8080 with AI service at %s", aiServiceURL)

	http.HandleFunc("/chat", func(w http.ResponseWriter, r *http.Request) {
		pkg.ServeChat(chatHub, w, r)
	})
	http.HandleFunc("/broadcaster", func(w http.ResponseWriter, r *http.Request) {
		pkg.ConnectBroadCaster(broadcastServerHub, w, r)
	})
	http.HandleFunc("/viewer", func(w http.ResponseWriter, r *http.Request) {
		// could ask user for an ID, now for random generate it, later add OAuth
		id := rand.Intn(100000000)
		pkg.AddNewUserViewerToHub(broadcastServerHub, w, r, id)
	})
	http.ListenAndServe(":8080", nil)
}
