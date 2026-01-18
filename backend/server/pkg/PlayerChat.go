package pkg

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
)

type PlayerChat struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
}

type PlayerChatConnected struct {
	PlayerClassicData    PlayerChat
	PlayerChatForWriting chan Message
	Conn                 *websocket.Conn
}

type WantToConnectOrDisconnect struct {
	Player    *PlayerChatConnected
	IsJoining bool
}

type Message struct {
	Username string `json:"username"`
	Message  string `json:"message"`
}

type ChatServerHub struct {
	ConnectDisconnectChan chan *WantToConnectOrDisconnect
	UniversalChat         chan Message
	Players               map[int]*PlayerChatConnected
	Mu                    sync.RWMutex
}

func NewChatServerHub() *ChatServerHub {
	return &ChatServerHub{
		ConnectDisconnectChan: make(chan *WantToConnectOrDisconnect, 100),
		UniversalChat:         make(chan Message, 300),
		Players:               make(map[int]*PlayerChatConnected),
	}
}

func (s *ChatServerHub) Run() {
	// Run these in background so they don't block main
	go s.HandleMemberUpdates()
	go s.BroadcastMessages()
}

func (s *ChatServerHub) HandleMemberUpdates() {
	for update := range s.ConnectDisconnectChan {
		s.Mu.Lock()
		if update.IsJoining {
			s.Players[update.Player.PlayerClassicData.ID] = update.Player
			fmt.Printf("User joined: %s\n", update.Player.PlayerClassicData.Username)
		} else {
			if _, ok := s.Players[update.Player.PlayerClassicData.ID]; ok {
				delete(s.Players, update.Player.PlayerClassicData.ID)
				close(update.Player.PlayerChatForWriting) // Close channel to stop writer loop
				fmt.Printf("User left: %s\n", update.Player.PlayerClassicData.Username)
			}
		}
		s.Mu.Unlock()
	}
}

func (s *ChatServerHub) BroadcastMessages() {
	for msg := range s.UniversalChat {
		s.Mu.RLock()
		for _, player := range s.Players {
			select {
			case player.PlayerChatForWriting <- msg:
			default:
			}
		}
		s.Mu.RUnlock()
	}
}

func ServeChat(s *ChatServerHub, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	idStr := query.Get("id")
	username := query.Get("username")

	id, err := strconv.Atoi(idStr)
	if err != nil || username == "" {
		http.Error(w, "Missing 'id' or 'username' query params", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	player := &PlayerChatConnected{
		PlayerClassicData:    PlayerChat{ID: id, Username: username},
		PlayerChatForWriting: make(chan Message, 100),
		Conn:                 conn,
	}

	s.ConnectDisconnectChan <- &WantToConnectOrDisconnect{Player: player, IsJoining: true}

	defer func() {
		s.ConnectDisconnectChan <- &WantToConnectOrDisconnect{Player: player, IsJoining: false}
		conn.Close()
	}()

	go func() {
		for msg := range player.PlayerChatForWriting {
			if err := conn.WriteJSON(msg); err != nil {
				return // Connection dead, exit loop
			}
		}
	}()

	for {
		var incomingMsg Message
		err := conn.ReadJSON(&incomingMsg)
		if err != nil {
			break // Client disconnected or error
		}

		incomingMsg.Username = username

		s.UniversalChat <- incomingMsg
	}
}
