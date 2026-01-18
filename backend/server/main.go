package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/dilyxs/medMarket/pkg"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func main() {
	// Load environment variables
	if err := godotenv.Load("../.env"); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Connect to MongoDB
	mongoURI := os.Getenv("MONGODB_URI")
	if mongoURI == "" {
		log.Fatal("MONGODB_URI not set in environment")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mongoClient, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer mongoClient.Disconnect(context.Background())

	// Verify MongoDB connection
	if err := mongoClient.Ping(ctx, nil); err != nil {
		log.Fatalf("MongoDB ping failed: %v", err)
	}
	log.Println("Connected to MongoDB")

	// Get users collection
	dbName := os.Getenv("MONGODB_DB")
	if dbName == "" {
		dbName = "db"
	}
	usersCollection := mongoClient.Database(dbName).Collection("users")

	// Get AI service URL from environment (with fallback)
	aiServiceURL := os.Getenv("AI_SERVICE_URL")
	if aiServiceURL == "" {
		aiServiceURL = "http://localhost:8000"
		log.Printf("AI_SERVICE_URL not set, using default: %s", aiServiceURL)
	}

	// Initialize hubs
	broadcastServerHub := pkg.NewBroadcastServerHub(aiServiceURL)
	chatHub := pkg.NewChatHub()
	go chatHub.Start()
	go broadcastServerHub.StartHubWork()

	chatHub := pkg.NewChatHub()
	go chatHub.Start()

	// Setup router
	router := mux.NewRouter()

	log.Printf("Starting server on :8080 with AI service at %s", aiServiceURL)

	http.HandleFunc("/chat", func(w http.ResponseWriter, r *http.Request) {
		clientID := fmt.Sprintf("client-%d-%d", rand.Intn(1000000), rand.Intn(1000000))
		pkg.AddChatClient(chatHub, w, r, clientID)
	})
	http.HandleFunc("/broadcaster", func(w http.ResponseWriter, r *http.Request) {
		pkg.ConnectBroadCaster(broadcastServerHub, w, r)
	})
	router.HandleFunc("/viewer", func(w http.ResponseWriter, r *http.Request) {
		id := rand.Intn(100000000)
		pkg.AddNewUserViewerToHub(broadcastServerHub, w, r, id)
	})
	router.HandleFunc("/chat", func(w http.ResponseWriter, r *http.Request) {
		clientID := fmt.Sprintf("client-%d-%d", rand.Intn(1000000), rand.Intn(1000000))
		pkg.AddChatClient(chatHub, w, r, clientID)
	})
	router.HandleFunc("/verify_deposit", pkg.VerifyDeposit)

	// Register Solana routes
	RegisterSolanaRoutes(router, usersCollection)

	// CORS middleware
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	fmt.Println("medMarket backend server running on :8080")
	log.Fatal(http.ListenAndServe(":8080", router))
}
