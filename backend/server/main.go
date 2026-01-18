package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"path/filepath"

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

	// Serve static files from Dataset
	// Assuming Dataset is at ../../Dataset relative to executable in backend/server
	// We need to resolve absolute path or ensure CWD is correct.
	// Users run "go run main.go" from backend/server.
	datasetPath := "../../Dataset"
	fs := http.FileServer(http.Dir(datasetPath))
	
	// Add CORS for static files
	http.Handle("/videos/", http.StripPrefix("/videos/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		fs.ServeHTTP(w, r)
	})))

	http.HandleFunc("/api/videos", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		
		// List mp4 files in Dataset/Echo (and potentially others, but let's start with Echo)
		files, err := filepath.Glob(filepath.Join(datasetPath, "*", "*.mp4"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		
		// Convert to relative paths acceptable by /videos/
		var videoList []string
		for _, f := range files {
			// f is like "../../Dataset/Echo/echo1.mp4"
			// We want "Echo/echo1.mp4"
			rel, _ := filepath.Rel(datasetPath, f)
			videoList = append(videoList, rel)
		}
		
		json.NewEncoder(w).Encode(videoList)
	})

	fmt.Println("medMarket backend server running on :8080")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		fmt.Printf("Server error: %v\n", err)
	}
}
