package pkg

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type ChatMessage struct {
	User string `json:"user"`
	Text string `json:"text"`
	Ts   int64  `json:"ts"`
}

type ChatClient struct {
	ID   string
	Conn *websocket.Conn
	Send chan ChatMessage
}

type ChatHub struct {
	Clients    map[string]*ChatClient
	Broadcast  chan ChatMessage
	Register   chan *ChatClient
	Unregister chan *ChatClient
	Mu         sync.RWMutex
}

func NewChatHub() *ChatHub {
	return &ChatHub{
		Clients:    make(map[string]*ChatClient),
		Broadcast:  make(chan ChatMessage, 256),
		Register:   make(chan *ChatClient, 16),
		Unregister: make(chan *ChatClient, 16),
	}
}

func (h *ChatHub) Start() {
	for {
		select {
		case client := <-h.Register:
			h.Mu.Lock()
			h.Clients[client.ID] = client
			h.Mu.Unlock()
			fmt.Printf("Chat client %s connected (%d total)\n", client.ID, len(h.Clients))

		case client := <-h.Unregister:
			h.Mu.Lock()
			if _, ok := h.Clients[client.ID]; ok {
				delete(h.Clients, client.ID)
				close(client.Send)
			}
			h.Mu.Unlock()
			fmt.Printf("Chat client %s disconnected (%d total)\n", client.ID, len(h.Clients))

		case msg := <-h.Broadcast:
			h.Mu.RLock()
			for _, client := range h.Clients {
				select {
				case client.Send <- msg:
				default:
					// skip if send channel full
				}
			}
			h.Mu.RUnlock()
		}
	}
}

func (c *ChatClient) ReadPump(hub *ChatHub) {
	defer func() {
		hub.Unregister <- c
		c.Conn.Close()
	}()

	for {
		var msg ChatMessage
		err := c.Conn.ReadJSON(&msg)
		if err != nil {
			break
		}

		if msg.Text == "" {
			continue
		}

		if msg.Ts == 0 {
			msg.Ts = time.Now().UnixMilli()
		}

		hub.Broadcast <- msg
	}
}

func (c *ChatClient) WritePump() {
	defer c.Conn.Close()

	for msg := range c.Send {
		err := c.Conn.WriteJSON(msg)
		if err != nil {
			break
		}
	}
}

func AddChatClient(hub *ChatHub, w http.ResponseWriter, r *http.Request, clientID string) {
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

	client := &ChatClient{
		ID:   clientID,
		Conn: conn,
		Send: make(chan ChatMessage, 64),
	}

	hub.Register <- client

	go client.WritePump()
	go client.ReadPump(hub)
}
