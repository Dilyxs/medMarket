package pkg

import (
	"log"
	"net/http"
)

func (v *UserViewer) StartGame(w http.ResponseWriter, r *http.Request, hub *BroadcastServerHub) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		w.WriteHeader(http.StatusUpgradeRequired)
		return
	}
	for askedQuestion := range v.QandAnswerChan {
		conn.ReadJSON(askedQuestion)
	}
}

func (b *Broadcaster) StartGame(w http.ResponseWriter, r *http.Request, hub *BroadcastServerHub) {
	hub.AcceptingUsers = false
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		w.WriteHeader(http.StatusUpgradeRequired)
	}
	var TotalCollectedSum float64 = 0
	for {
		var qa QandAnswer
		err := conn.ReadJSON(&qa)
		if err != nil {
			log.Fatalf("not right format!: %v", err)
			return
		}
		hub.Mu.Lock()
		for _, viewer := range hub.Viewers {
			viewer.QandAnswerChan <- QandAnswer{Question: qa.Question, PossibleResponse: qa.PossibleResponse}
		}
		hub.Mu.Unlock()

	}
}
