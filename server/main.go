package main

import (
	"math/rand"
	"net/http"

	"github.com/dilyxs/medMarket/pkg"
)

func main() {
	// in theory we could have multiple different videoServers running Concurrently. but
	// for simplicity we will just run one.
	broadcastServerHub := pkg.NewBroadcastServerHub()
	go broadcastServerHub.StartHubWork()
	http.HandleFunc("/broadcaster", func(w http.ResponseWriter, r *http.Request) {
		pkg.ConnectBroadCaster(broadcastServerHub, w, r)
	})
	http.HandleFunc("/viewer", func(w http.ResponseWriter, r *http.Request) {
		// could ask user for an ID, now for random generate it, later add OAuth
		id := rand.Intn(100000000)
		pkg.AddNewUserViewerToHub(broadcastServerHub, w, r, id)
	})
}
