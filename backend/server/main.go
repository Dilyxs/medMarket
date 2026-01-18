package main

import (
	"github.com/dilyxs/medMarket/cryptostuff"
)

func main() {
	/*
		broadcastServerHub := pkg.NewBroadcastServerHub()
		chatHub := pkg.NewChatServerHub()
		chatHub.Run()
		go broadcastServerHub.StartHubWork()
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
	*/
	cryptostuff.LoadServerAccount()
}
