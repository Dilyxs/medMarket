package pkg

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/mongo"
)

// Question represents a quiz question
type Question struct {
	ID           string   `json:"id"`
	Question     string   `json:"question"`
	Options      []string `json:"options"`      // 2-4 options
	CorrectIndex int      `json:"-"`            // Don't send to clients
	TimeLimit    int      `json:"time_limit"`   // seconds
	CreatedAt    time.Time `json:"created_at"`
}

// QuestionForClient is sent to players (without correct answer)
type QuestionForClient struct {
	ID        string   `json:"id"`
	Question  string   `json:"question"`
	Options   []string `json:"options"`
	TimeLimit int      `json:"time_limit"`
	StartTime int64    `json:"start_time"` // Unix timestamp in ms
}

// WebSocket message types
type WSMessage interface {
	MessageType() string
}

type NewQuestionMsg struct {
	Type     string            `json:"type"`
	Question QuestionForClient `json:"question"`
}

func (m NewQuestionMsg) MessageType() string { return "new_question" }

type BetConfirmedMsg struct {
	Type       string    `json:"type"`
	Bets       []float64 `json:"bets"`
	NewBalance float64   `json:"new_balance"`
}

func (m BetConfirmedMsg) MessageType() string { return "bet_confirmed" }

type EliminatedMsg struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

func (m EliminatedMsg) MessageType() string { return "eliminated" }

type GameStateMsg struct {
	Type            string             `json:"type"`
	GameActive      bool               `json:"game_active"`
	Jackpot         float64            `json:"jackpot"`
	Tokens          float64            `json:"tokens"`
	IsActive        bool               `json:"is_active"`
	CurrentQuestion *QuestionForClient `json:"current_question,omitempty"`
}

func (m GameStateMsg) MessageType() string { return "game_state" }

type GameEndedMsg struct {
	Type    string      `json:"type"`
	Results QuizResults `json:"results"`
}

func (m GameEndedMsg) MessageType() string { return "game_ended" }

type QuestionLiveMsg struct {
	Type       string `json:"type"`
	QuestionID string `json:"question_id"`
}

func (m QuestionLiveMsg) MessageType() string { return "question_live" }

type QuestionQueuedMsg struct {
	Type          string    `json:"type"`
	Question      *Question `json:"question"`
	QueuePosition int       `json:"queue_position"`
}

func (m QuestionQueuedMsg) MessageType() string { return "question_queued" }

type ReadyForQuestionMsg struct {
	Type             string `json:"type"`
	RemainingPlayers int    `json:"remaining_players"`
}

func (m ReadyForQuestionMsg) MessageType() string { return "ready_for_question" }

// BetSubmission represents a player's bet on a question
type BetSubmission struct {
	PlayerID   string    `json:"player_id"`
	QuestionID string    `json:"question_id"`
	Bets       []float64 `json:"bets"` // Array of bets for each option
	Timestamp  time.Time `json:"timestamp"`
}

// QuizPlayer represents a player in the quiz
type QuizPlayer struct {
	UserID       string
	Username     string
	Email        string
	Conn         *websocket.Conn
	Send         chan WSMessage
	Tokens       float64
	IsActive     bool // false if eliminated
	CurrentBets  []float64
	Mu           sync.RWMutex
}

// QuizBroadcaster represents the broadcaster/host
type QuizBroadcaster struct {
	Conn *websocket.Conn
	Send chan WSMessage
}

// QuizResults sent after each question
type QuizResults struct {
	Type              string                 `json:"type"` // "results"
	QuestionID        string                 `json:"question_id"`
	CorrectIndex      int                    `json:"correct_index"`
	EliminatedPlayers []string               `json:"eliminated_players"`
	RemainingPlayers  int                    `json:"remaining_players"`
	Jackpot           float64                `json:"jackpot"`
	PlayerResults     map[string]PlayerResult `json:"player_results"`
}

type PlayerResult struct {
	Bets          []float64 `json:"bets"`
	Won           bool      `json:"won"`
	TokensReturned float64  `json:"tokens_returned"`
	TokensLost    float64   `json:"tokens_lost"`
	NewBalance    float64   `json:"new_balance"`
}

func (r QuizResults) MessageType() string { return r.Type }

// QuizGameState tracks the current game state
type QuizGameState struct {
	CurrentQuestion   *Question
	QuestionStartTime time.Time
	QuestionQueue     []*Question
	Jackpot           float64
	GameActive        bool
	QuestionActive    bool
	Timer             *time.Timer
}

// QuizHub manages the quiz game
type QuizHub struct {
	Players          map[string]*QuizPlayer // userID -> player
	Broadcaster      *QuizBroadcaster
	GameState        *QuizGameState
	Bets             map[string]*BetSubmission // playerID -> bet for current question
	Register         chan *QuizPlayer
	Unregister       chan *QuizPlayer
	RegisterBroadcaster   chan *QuizBroadcaster
	UnregisterBroadcaster chan *QuizBroadcaster
	SubmitQuestion   chan *Question
	SubmitBet        chan *BetSubmission
	Mu               sync.RWMutex
	UsersCollection  *mongo.Collection
}

func NewQuizHub(usersCollection *mongo.Collection) *QuizHub {
	return &QuizHub{
		Players:         make(map[string]*QuizPlayer),
		GameState:       &QuizGameState{
			QuestionQueue: make([]*Question, 0),
			GameActive:    true,
		},
		Bets:            make(map[string]*BetSubmission),
		Register:        make(chan *QuizPlayer, 16),
		Unregister:      make(chan *QuizPlayer, 16),
		RegisterBroadcaster:   make(chan *QuizBroadcaster, 1),
		UnregisterBroadcaster: make(chan *QuizBroadcaster, 1),
		SubmitQuestion:  make(chan *Question, 32),
		SubmitBet:       make(chan *BetSubmission, 256),
		UsersCollection: usersCollection,
	}
}

func (h *QuizHub) Start() {
	for {
		select {
		case player := <-h.Register:
			h.Mu.Lock()
			h.Players[player.UserID] = player
			h.Mu.Unlock()
			
			// Give player 50 tokens on join
			player.Mu.Lock()
			player.Tokens = 50.0
			player.IsActive = true
			player.Mu.Unlock()
			
			log.Printf("Quiz player %s (%s) joined with 50 tokens (%d total players)\n", 
				player.Username, player.UserID, len(h.Players))
			
			// Send current game state to new player
			h.sendGameStateToPlayer(player)

		case player := <-h.Unregister:
			h.Mu.Lock()
			if _, ok := h.Players[player.UserID]; ok {
				delete(h.Players, player.UserID)
				close(player.Send)
			}
			h.Mu.Unlock()
			log.Printf("Quiz player %s disconnected (%d total players)\n", 
				player.UserID, len(h.Players))

		case broadcaster := <-h.RegisterBroadcaster:
			h.Mu.Lock()
			h.Broadcaster = broadcaster
			h.Mu.Unlock()
			log.Println("Quiz broadcaster connected")

		case broadcaster := <-h.UnregisterBroadcaster:
			h.Mu.Lock()
			if h.Broadcaster == broadcaster {
				close(broadcaster.Send)
				h.Broadcaster = nil
			}
			h.Mu.Unlock()
			log.Println("Quiz broadcaster disconnected")

		case question := <-h.SubmitQuestion:
			h.handleNewQuestion(question)

		case bet := <-h.SubmitBet:
			h.handleBetSubmission(bet)
		}
	}
}

func (h *QuizHub) handleNewQuestion(question *Question) {
	h.Mu.Lock()
	
	// If a question is currently active, queue it
	if h.GameState.QuestionActive {
		h.GameState.QuestionQueue = append(h.GameState.QuestionQueue, question)
		log.Printf("Question queued: %s (%d in queue)\n", question.Question, len(h.GameState.QuestionQueue))
		h.Mu.Unlock()
		
		// Notify broadcaster
		h.notifyBroadcaster(QuestionQueuedMsg{
			Type:          "question_queued",
			Question:      question,
			QueuePosition: len(h.GameState.QuestionQueue),
		})
		return
	}
	
	// Start new question
	h.GameState.CurrentQuestion = question
	h.GameState.QuestionActive = true
	h.GameState.QuestionStartTime = time.Now()
	h.Bets = make(map[string]*BetSubmission) // Clear previous bets
	
	h.Mu.Unlock()
	
	log.Printf("Broadcasting new question: %s\n", question.Question)
	
	// Broadcast question to all active players
	questionMsg := QuestionForClient{
		ID:        question.ID,
		Question:  question.Question,
		Options:   question.Options,
		TimeLimit: question.TimeLimit,
		StartTime: time.Now().UnixMilli(),
	}
	
	broadcastMsg := NewQuestionMsg{
		Type:     "new_question",
		Question: questionMsg,
	}
	
	log.Printf("Broadcasting question to players: ID=%s, Question=%s, Options=%v, TimeLimit=%d\n", 
		questionMsg.ID, questionMsg.Question, questionMsg.Options, questionMsg.TimeLimit)
	
	h.broadcastToPlayers(broadcastMsg)
	
	// Notify broadcaster that question is live
	h.notifyBroadcaster(QuestionLiveMsg{
		Type:       "question_live",
		QuestionID: question.ID,
	})
	
	// Start timer
	h.Mu.Lock()
	h.GameState.Timer = time.AfterFunc(time.Duration(question.TimeLimit)*time.Second, func() {
		h.processQuestionResults()
	})
	h.Mu.Unlock()
}

func (h *QuizHub) handleBetSubmission(bet *BetSubmission) {
	h.Mu.Lock()
	defer h.Mu.Unlock()
	
	if !h.GameState.QuestionActive {
		log.Printf("Bet rejected: no active question\n")
		return
	}
	
	player, exists := h.Players[bet.PlayerID]
	if !exists || !player.IsActive {
		log.Printf("Bet rejected: player %s not active\n", bet.PlayerID)
		return
	}
	
	// Validate bet
	totalBet := 0.0
	for _, b := range bet.Bets {
		totalBet += b
	}
	
	player.Mu.Lock()
	if totalBet > player.Tokens {
		player.Mu.Unlock()
		log.Printf("Bet rejected: insufficient tokens (has %.2f, tried to bet %.2f)\n", player.Tokens, totalBet)
		return
	}
	
	// Deduct tokens
	player.Tokens -= totalBet
	player.CurrentBets = bet.Bets
	player.Mu.Unlock()
	
	// Store bet
	h.Bets[bet.PlayerID] = bet
	
	log.Printf("Player %s bet %.2f tokens across %d options\n", bet.PlayerID, totalBet, len(bet.Bets))
	
	// Notify player of successful bet
	player.Send <- BetConfirmedMsg{
		Type:       "bet_confirmed",
		Bets:       bet.Bets,
		NewBalance: player.Tokens,
	}
}

func (h *QuizHub) processQuestionResults() {
	h.Mu.Lock()
	
	if !h.GameState.QuestionActive {
		h.Mu.Unlock()
		return
	}
	
	question := h.GameState.CurrentQuestion
	if question == nil {
		log.Println("processQuestionResults called but CurrentQuestion is nil")
		h.Mu.Unlock()
		return
	}
	correctIndex := question.CorrectIndex
	
	log.Printf("Processing results for question: %s (correct answer: %d)\n", question.ID, correctIndex)
	
	results := QuizResults{
		Type:              "results",
		QuestionID:        question.ID,
		CorrectIndex:      correctIndex,
		EliminatedPlayers: make([]string, 0),
		PlayerResults:     make(map[string]PlayerResult),
		Jackpot:           h.GameState.Jackpot,
	}
	
	// Process each player
	for playerID, player := range h.Players {
		if !player.IsActive {
			continue
		}
		
		bet, hasBet := h.Bets[playerID]
		
		player.Mu.Lock()
		
		// Check if player has bet on correct answer
		correctBet := 0.0
		wrongBets := 0.0
		
		if hasBet && correctIndex < len(bet.Bets) {
			correctBet = bet.Bets[correctIndex]
			for i, b := range bet.Bets {
				if i != correctIndex {
					wrongBets += b
				}
			}
		}
		
		// If player didn't bet on correct answer or didn't bet at all, eliminate
		if correctBet == 0 {
			player.IsActive = false
			results.EliminatedPlayers = append(results.EliminatedPlayers, playerID)
			
			// All their money goes to jackpot
			if hasBet {
				h.GameState.Jackpot += wrongBets
			}
			
			var betArray []float64
			if hasBet {
				betArray = bet.Bets
			}
			
			results.PlayerResults[playerID] = PlayerResult{
				Bets:          betArray,
				Won:           false,
				TokensReturned: 0,
				TokensLost:    wrongBets,
				NewBalance:    player.Tokens,
			}
			
			log.Printf("Player %s ELIMINATED (bet %.2f on correct, %.2f on wrong)\n", 
				playerID, correctBet, wrongBets)
		} else {
			// Player survives - return correct bet, jackpot gets wrong bets
			player.Tokens += correctBet
			h.GameState.Jackpot += wrongBets
			
			var betArray []float64
			if hasBet {
				betArray = bet.Bets
			}
			
			results.PlayerResults[playerID] = PlayerResult{
				Bets:          betArray,
				Won:           true,
				TokensReturned: correctBet,
				TokensLost:    wrongBets,
				NewBalance:    player.Tokens,
			}
			
			log.Printf("Player %s SURVIVED (returned %.2f, lost %.2f to jackpot, new balance: %.2f)\n", 
				playerID, correctBet, wrongBets, player.Tokens)
		}
		
		player.Mu.Unlock()
	}
	
	// Count remaining active players
	remainingCount := 0
	var lastPlayer *QuizPlayer
	for _, player := range h.Players {
		if player.IsActive {
			remainingCount++
			lastPlayer = player
		}
	}
	
	results.RemainingPlayers = remainingCount
	results.Jackpot = h.GameState.Jackpot
	
	log.Printf("Results: %d eliminated, %d remaining, jackpot: %.2f\n", 
		len(results.EliminatedPlayers), remainingCount, h.GameState.Jackpot)
	
	// Check for game end conditions
	gameEnded := false
	if remainingCount == 1 && lastPlayer != nil {
		// Winner!
		lastPlayer.Mu.Lock()
		lastPlayer.Tokens += h.GameState.Jackpot
		winnerBalance := lastPlayer.Tokens
		winnerID := lastPlayer.UserID
		lastPlayer.Mu.Unlock()
		
		log.Printf("WINNER: %s with %.2f tokens!\n", winnerID, winnerBalance)
		
		results.PlayerResults[winnerID] = PlayerResult{
			Bets:          results.PlayerResults[winnerID].Bets,
			Won:           true,
			TokensReturned: results.PlayerResults[winnerID].TokensReturned + h.GameState.Jackpot,
			TokensLost:    results.PlayerResults[winnerID].TokensLost,
			NewBalance:    winnerBalance,
		}
		
		h.GameState.Jackpot = 0
		gameEnded = true
		
	} else if remainingCount == 0 {
		// House wins
		log.Printf("HOUSE WINS! Jackpot: %.2f tokens\n", h.GameState.Jackpot)
		h.GameState.Jackpot = 0
		gameEnded = true
	}
	
	h.GameState.QuestionActive = false
	h.GameState.CurrentQuestion = nil
	
	h.Mu.Unlock()
	
	// Broadcast results to all players
	h.broadcastToPlayers(results)
	
	// Notify broadcaster
	h.notifyBroadcaster(results)
	
	// Eliminate players by disconnecting them
	h.Mu.RLock()
	for _, playerID := range results.EliminatedPlayers {
		if player, exists := h.Players[playerID]; exists {
			player.Send <- EliminatedMsg{
				Type:    "eliminated",
				Message: "You have been eliminated from the quiz!",
			}
			// Close connection after a delay to ensure message is sent
			go func(p *QuizPlayer) {
				time.Sleep(2 * time.Second)
				p.Conn.Close()
			}(player)
		}
	}
	h.Mu.RUnlock()
	
	// If game ended, notify everyone
	if gameEnded {
		h.Mu.Lock()
		h.GameState.GameActive = false
		h.Mu.Unlock()
		
		h.broadcastToPlayers(GameEndedMsg{
			Type:    "game_ended",
			Results: results,
		})
		
		h.notifyBroadcaster(GameEndedMsg{
			Type:    "game_ended",
			Results: results,
		})
	} else {
		// Process next question in queue
		h.Mu.Lock()
		if len(h.GameState.QuestionQueue) > 0 {
			nextQuestion := h.GameState.QuestionQueue[0]
			h.GameState.QuestionQueue = h.GameState.QuestionQueue[1:]
			h.Mu.Unlock()
			
			// Small delay before next question
			time.Sleep(3 * time.Second)
			h.SubmitQuestion <- nextQuestion
		} else {
			h.Mu.Unlock()
			// Notify broadcaster they can submit next question
			h.notifyBroadcaster(ReadyForQuestionMsg{
				Type:             "ready_for_question",
				RemainingPlayers: remainingCount,
			})
		}
	}
}

func (h *QuizHub) sendGameStateToPlayer(player *QuizPlayer) {
	h.Mu.RLock()
	defer h.Mu.RUnlock()
	
	state := GameStateMsg{
		Type:       "game_state",
		GameActive: h.GameState.GameActive,
		Jackpot:    h.GameState.Jackpot,
		Tokens:     player.Tokens,
		IsActive:   player.IsActive,
	}
	
	if h.GameState.QuestionActive && h.GameState.CurrentQuestion != nil {
		elapsed := time.Since(h.GameState.QuestionStartTime).Seconds()
		remaining := float64(h.GameState.CurrentQuestion.TimeLimit) - elapsed
		
		if remaining > 0 {
			questionForClient := QuestionForClient{
				ID:        h.GameState.CurrentQuestion.ID,
				Question:  h.GameState.CurrentQuestion.Question,
				Options:   h.GameState.CurrentQuestion.Options,
				TimeLimit: h.GameState.CurrentQuestion.TimeLimit,
				StartTime: h.GameState.QuestionStartTime.UnixMilli(),
			}
			state.CurrentQuestion = &questionForClient
		}
	}
	
	player.Send <- state
}

func (h *QuizHub) broadcastToPlayers(msg WSMessage) {
	h.Mu.RLock()
	defer h.Mu.RUnlock()
	
	for _, player := range h.Players {
		select {
		case player.Send <- msg:
		default:
			// Skip if channel full
		}
	}
}

func (h *QuizHub) notifyBroadcaster(msg WSMessage) {
	h.Mu.RLock()
	defer h.Mu.RUnlock()
	
	if h.Broadcaster != nil {
		select {
		case h.Broadcaster.Send <- msg:
		default:
			// Don't block if channel full
		}
	}
}

// WebSocket handlers

func (p *QuizPlayer) ReadPump(hub *QuizHub) {
	defer func() {
		hub.Unregister <- p
		p.Conn.Close()
	}()
	
	p.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	p.Conn.SetPongHandler(func(string) error {
		p.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	
	for {
		var msg map[string]interface{}
		err := p.Conn.ReadJSON(&msg)
		if err != nil {
			break
		}
		
		msgType, _ := msg["type"].(string)
		
		switch msgType {
		case "submit_bet":
			// Extract bet data
			betsData, _ := msg["bets"].([]interface{})
			bets := make([]float64, len(betsData))
			for i, b := range betsData {
				if val, ok := b.(float64); ok {
					bets[i] = val
				}
			}
			
			questionID, _ := msg["question_id"].(string)
			
			bet := &BetSubmission{
				PlayerID:   p.UserID,
				QuestionID: questionID,
				Bets:       bets,
				Timestamp:  time.Now(),
			}
			
			hub.SubmitBet <- bet
		}
	}
}

func (p *QuizPlayer) WritePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		p.Conn.Close()
	}()
	
	for {
		select {
		case msg, ok := <-p.Send:
			if !ok {
				p.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			
			p.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := p.Conn.WriteJSON(msg)
			if err != nil {
				return
			}
			
		case <-ticker.C:
			p.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := p.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (b *QuizBroadcaster) ReadPump(hub *QuizHub) {
	defer func() {
		hub.UnregisterBroadcaster <- b
		b.Conn.Close()
	}()
	
	for {
		var msg map[string]interface{}
		err := b.Conn.ReadJSON(&msg)
		if err != nil {
			break
		}
		
		msgType, _ := msg["type"].(string)
		
		switch msgType {
		case "submit_question":
			// Parse question data
			questionText, _ := msg["question"].(string)
			optionsData, _ := msg["options"].([]interface{})
			correctIndex, _ := msg["correct_index"].(float64)
			timeLimit, _ := msg["time_limit"].(float64)
			
			options := make([]string, 0)
			for _, opt := range optionsData {
				if str, ok := opt.(string); ok && str != "" {
					options = append(options, str)
				}
			}
			
			if len(options) < 2 || len(options) > 4 {
				log.Printf("Invalid question: must have 2-4 options\n")
				continue
			}
			
			question := &Question{
				ID:           fmt.Sprintf("q-%d", time.Now().UnixNano()),
				Question:     questionText,
				Options:      options,
				CorrectIndex: int(correctIndex),
				TimeLimit:    int(timeLimit),
				CreatedAt:    time.Now(),
			}
			
			hub.SubmitQuestion <- question
		}
	}
}

func (b *QuizBroadcaster) WritePump() {
	defer b.Conn.Close()
	
	for msg := range b.Send {
		b.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		err := b.Conn.WriteJSON(msg)
		if err != nil {
			return
		}
	}
}

func ConnectQuizBroadcaster(hub *QuizHub, w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		w.WriteHeader(http.StatusUpgradeRequired)
		w.Write([]byte(`{"error": "WebSocket upgrade failed"}`))
		return
	}
	
	broadcaster := &QuizBroadcaster{
		Conn: conn,
		Send: make(chan WSMessage, 64),
	}
	
	hub.RegisterBroadcaster <- broadcaster
	
	go broadcaster.WritePump()
	go broadcaster.ReadPump(hub)
}

func ConnectQuizPlayer(hub *QuizHub, w http.ResponseWriter, r *http.Request, userID, username, email string) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		w.WriteHeader(http.StatusUpgradeRequired)
		json.NewEncoder(w).Encode(map[string]string{"error": "WebSocket upgrade failed"})
		return
	}
	
	player := &QuizPlayer{
		UserID:   userID,
		Username: username,
		Email:    email,
		Conn:     conn,
		Send:     make(chan WSMessage, 64),
		IsActive: true,
	}
	
	hub.Register <- player
	
	go player.WritePump()
	go player.ReadPump(hub)
}
