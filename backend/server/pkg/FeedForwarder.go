package pkg

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type UserViewer struct {
	ID                        int
	Conn                      *websocket.Conn
	UserReceivingVideoDetails chan VideoFrameWithAnnotations
}
type Broadcaster struct {
	ID                      int
	Conn                    *websocket.Conn
	UserReadingVideoDetails chan VideoFrameWithAnnotations
}
type Centroid struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type BoundingBox struct {
	XMin   int `json:"x_min"`
	YMin   int `json:"y_min"`
	XMax   int `json:"x_max"`
	YMax   int `json:"y_max"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

type Region struct {
	MaskIndex   int         `json:"mask_index"`
	BoundingBox BoundingBox `json:"bounding_box"`
	Centroid    Centroid    `json:"centroid"`
	AreaPixels  int         `json:"area_pixels"`
	MaskShape   []int       `json:"mask_shape"`
}

type MLAnalysisResult struct {
	FrameIndex    int      `json:"frame_index"`
	MasksDetected int      `json:"masks_detected"`
	Regions       []Region `json:"regions"`
}

type VideoFrameWithAnnotations struct {
	Frame    []byte           `json:"frame"`
	Analysis MLAnalysisResult `json:"analysis"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	ReadBufferSize:  128 * 128,
	WriteBufferSize: 128 * 128,
}

type BroadcastServerHub struct {
	Viewers                               map[int]*UserViewer
	VideoDetailsChan                      chan VideoFrameWithAnnotations
	EndOFStream                           chan bool
	ListenForIncomingUserOrDisconnections chan *UserViewerAddition
	Mu                                    sync.RWMutex
}
type UserViewerAddition struct {
	User       *UserViewer
	WantsToAdd bool
}

func AddNewUserViewerToHub(hub *BroadcastServerHub, w http.ResponseWriter, r *http.Request, viewerID int) {
	w.Header().Set("Content-Type", "application/json")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		w.WriteHeader(http.StatusUpgradeRequired)
		if _, ConnectionErr := w.Write([]byte(`{"error": "WebSocket upgrade failed"}`)); ConnectionErr != nil {
			return
		}
	}
	VideoUser := &UserViewer{
		ID:                        viewerID,
		Conn:                      conn,
		UserReceivingVideoDetails: make(chan VideoFrameWithAnnotations, 1000),
	}
	hub.ListenForIncomingUserOrDisconnections <- &UserViewerAddition{
		User:       VideoUser,
		WantsToAdd: true,
	}
	go VideoUser.ListenForVideoDetails()
	go VideoUser.ReadPump(hub)
}

func (v *UserViewer) ReadPump(hub *BroadcastServerHub) {
	defer func() {
		v.Conn.Close()
		hub.ListenForIncomingUserOrDisconnections <- &UserViewerAddition{
			User:       v,
			WantsToAdd: false,
		}
	}()
	for {
		if _, _, err := v.Conn.ReadMessage(); err != nil { // ok so frontend will always send in some pings and other stuff, just ignore that stuff
			break
		}
	}
}

func (b *BroadcastServerHub) AddOrRemoveUser() {
	for incomingUser := range b.ListenForIncomingUserOrDisconnections {
		b.Mu.Lock()
		if incomingUser.WantsToAdd {
			b.Viewers[incomingUser.User.ID] = incomingUser.User
		} else {
			delete(b.Viewers, incomingUser.User.ID)
		}
		b.Mu.Unlock()
	}
}

func (v *UserViewer) ListenForVideoDetails() {
	for message := range v.UserReceivingVideoDetails {
		if err := v.Conn.WriteJSON(message); err != nil { // happens if user ends the session
			return
		}
	}
}

func (b *BroadcastServerHub) EnndBroadcastingSession() {
	for range b.EndOFStream {
		b.Mu.RLock()
		for _, viewer := range b.Viewers {
			if err := viewer.Conn.WriteMessage(websocket.TextMessage, []byte("stream has ended")); err != nil { // happens if user
				continue
			}
		}
		b.Mu.RUnlock()
	}
}

func ConnectBroadCaster(hub *BroadcastServerHub, w http.ResponseWriter, r *http.Request) {
	fmt.Println("ConnectBroadCaster: Incoming connection...")
	w.Header().Set("Content-Type", "application/json")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("ConnectBroadCaster: Upgrade failed: %v\n", err)
		w.WriteHeader(http.StatusUpgradeRequired)
		if _, ConnErr := w.Write([]byte(`{"error": "WebSocket upgrade failed"}`)); ConnErr != nil { // this happens cause user left the page or something
			hub.EndOFStream <- true
		}
	}
	defer func() {
		conn.Close()
		select {
		case hub.EndOFStream <- true:
		default:

		}
	}()
	Broadcaster := &Broadcaster{
		Conn:                    conn,
		UserReadingVideoDetails: make(chan VideoFrameWithAnnotations, 1000),
	}
	fmt.Println("ConnectBroadCaster: Connected successfully. Starting listener.")
	Broadcaster.ListenForVideoInput(hub)
}

func (b *Broadcaster) ListenForVideoInput(hub *BroadcastServerHub) {
	fmt.Println("ListenForVideoInput: Started loop")
	for {
		var newMessage VideoFrameWithAnnotations
		err := b.Conn.ReadJSON(&newMessage)
		if err != nil {
			fmt.Printf("ListenForVideoInput: ReadJSON Error: %v\n", err)
			fmt.Println("cannot decode video")
			hub.EndOFStream <- true
			return
		}
		// fmt.Printf("ListenForVideoInput: Received frame. Bytes: %d\n", len(newMessage.Frame))
		if len(newMessage.Frame) > 0 {
			fmt.Printf("Backend: Received frame of size %d bytes. Analysis: %d masks, FrameIndex: %d\n", len(newMessage.Frame), newMessage.Analysis.MasksDetected, newMessage.Analysis.FrameIndex)
		} else {
			fmt.Println("Backend: Received empty frame")
		}
		hub.VideoDetailsChan <- newMessage
	}
}

func (b *BroadcastServerHub) ShareBroadscastingDetails() {
	for message := range b.VideoDetailsChan {
		// fmt.Println("ShareBroadscastingDetails: Broadcasting message to viewers...")
		b.Mu.RLock()
		for _, viewer := range b.Viewers {
			select {
			case viewer.UserReceivingVideoDetails <- message:
			default:
			}
		}
		b.Mu.RUnlock()
	}
}

func NewBroadcastServerHub() *BroadcastServerHub {
	return &BroadcastServerHub{
		Viewers:                               make(map[int]*UserViewer),
		VideoDetailsChan:                      make(chan VideoFrameWithAnnotations, 1000),
		EndOFStream:                           make(chan bool),
		ListenForIncomingUserOrDisconnections: make(chan *UserViewerAddition, 1000),
		Mu:                                    sync.RWMutex{},
	}
}

func (b *BroadcastServerHub) StartHubWork() {
	go b.AddOrRemoveUser()
	go b.ShareBroadscastingDetails()
	go b.EnndBroadcastingSession()
}
