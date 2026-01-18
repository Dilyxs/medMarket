package pkg

import (
	"log"
	"net/http"
	"time"
)

type UserResponseForQuestion struct {
	Question     string        `json:"question"`
	ChosenAnswer SplitResponse `json:"chosenanswer"`
}
type SplitResponse struct {
	Option1 float64 `json:"option1"`
	Option2 float64 `json:"option2"`
	Option3 float64 `json:"option3"`
	Option4 float64 `json:"option4"`
}

func (split SplitResponse) CalculateTotal() float64 {
	return split.Option1 + split.Option2 + split.Option3 + split.Option4
}

func (split SplitResponse) CalculteLoss(RightResponseIndex int) float64 {
	total := split.CalculateTotal()
	switch RightResponseIndex {
	case 1:
		return total - split.Option1
	case 2:
		return total - split.Option2
	case 3:
		return total - split.Option3
	case 4:
		return total - split.Option4
	}
	return total
}

type UserResponseForHub struct {
	User        *UserViewer
	Question    string
	ChoseAnswer *SplitResponse
}

func (v *UserViewer) StartGame(w http.ResponseWriter, r *http.Request, hub *BroadcastServerHub) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		w.WriteHeader(http.StatusUpgradeRequired)
		return
	}
	userWritingChan := make(chan UserResponseForQuestion, 100)
	go func() {
		for {
			var UserResponse UserResponseForQuestion
			if err := conn.ReadJSON(&UserResponse); err != nil {
				log.Fatalf("give correct json!: %v", err)
			}
			userWritingChan <- UserResponse
		}
	}()
	for askedQuestion := range v.QandAnswerChan {
		conn.WriteJSON(askedQuestion)

		select {
		case <-time.After(5 * time.Second):
			hub.QandAnswerEvaluator <- UserResponseForHub{User: v, Question: askedQuestion.Question, ChoseAnswer: nil}
		case msg := <-userWritingChan:
			hub.QandAnswerEvaluator <- UserResponseForHub{User: v, Question: askedQuestion.Question, ChoseAnswer: &msg.ChosenAnswer}
		}
	}
}

func (b *Broadcaster) StartGame(w http.ResponseWriter, r *http.Request, hub *BroadcastServerHub) {
	hub.AcceptingUsers = false
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		w.WriteHeader(http.StatusUpgradeRequired)
	}
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
		for incomingUserResponseForQuestion := range hub.QandAnswerEvaluator {
			loss := incomingUserResponseForQuestion.ChoseAnswer.CalculteLoss(qa.RightAnswerIndex)
			remainingCurrency := incomingUserResponseForQuestion.ChoseAnswer.CalculateTotal() - loss
			TotalCollectedSum += loss
			if remainingCurrency == 0 {
				hub.Mu.Lock()
				delete(hub.Viewers, incomingUserResponseForQuestion.User.ID)
			}
			// now do the following, must propagate back user remainingCurrency to user in a channel!!!! TO-DO for COPILOT
			hub.Mu.Lock()
			totalPlayerCount := len(hub.Viewers)
			hub.Mu.Unlock()

			if totalPlayerCount == 1 { // distribute everyone's loss to him
				// I don't know write something to his Channel
				return
			}
			if totalPlayerCount == 0 {
				// server keeps the win
				return
			} // otherwise keep playing the game
		}

	}
}
