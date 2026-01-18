package pkg

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type UserViewer struct {
	ID                        int
	Conn                      *websocket.Conn
	UserReceivingVideoDetails chan VideoFrameWithAnnotations
	QandAnswerChan            chan QandAnswer
	done                      chan struct{}
}
type Broadcaster struct {
	ID                      int
	Conn                    *websocket.Conn
	UserReadingVideoDetails chan VideoFrameWithAnnotations
}
type BoundingBox struct {
	XMin   int `json:"x_min"`
	YMin   int `json:"y_min"`
	XMax   int `json:"x_max"`
	YMax   int `json:"y_max"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

type Centroid struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Region struct {
	MaskIndex   int         `json:"mask_index"`
	BoundingBox BoundingBox `json:"bounding_box"`
	Centroid    Centroid    `json:"centroid"`
	AreaPixels  int         `json:"area_pixels"`
	Polygon     [][]int     `json:"polygon"`
}
type RectangleDataValere struct {
	X1 float64 `json:"x1"`
	X2 float64 `json:"x2"`
	Y1 float64 `json:"y1"`
	Y2 float64 `json:"y2"`
}
type VideoFrameValere struct {
	Frame         []byte              `json:"frame"`
	HasRectangle  bool                `json:"hasrectangle"`
	RectangleData RectangleDataValere `json:"rectangle"`
}

type AnnotationMetadata struct {
	FrameIndex    int      `json:"frame_index"`
	MasksDetected int      `json:"masks_detected"`
	Regions       []Region `json:"regions"`
}
type VideoFrameWithAnnotations struct {
	Frame    []byte             `json:"frame"`
	Metadata AnnotationMetadata `json:"metadata"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	ReadBufferSize:  1024 * 1024, // 1MB buffer for video frames
	WriteBufferSize: 1024 * 1024, // 1MB buffer for video frames
}

type QandAnswer struct {
	Question         string   `json:"question"`
	PossibleResponse []string `json:"possibleresponses"`
	RightAnswerIndex int      `json:"rightanswerindex"`
}
type QuestionWithoutAnswer struct {
	Question         string   `json:"question"`
	PossibleResponse []string `json:"possibleresponses"`
}
type BroadcastServerHub struct {
	AcceptingUsers                        bool
	Viewers                               map[int]*UserViewer
	ValereRawVideoDetailsChan             chan VideoFrameValere
	VideoDetailsChan                      chan VideoFrameWithAnnotations
	EndOFStream                           chan bool
	ListenForIncomingUserOrDisconnections chan *UserViewerAddition
	QandAnswer                            chan QandAnswer
	Mu                                    sync.RWMutex
	// AI service integration fields
	AIServiceURL   string
	CurrentSession string
	AIClient       *AIServiceClient
}
type UserViewerAddition struct {
	User       *UserViewer
	WantsToAdd bool
}

func AddNewUserViewerToHub(hub *BroadcastServerHub, w http.ResponseWriter, r *http.Request, viewerID int) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Viewer WebSocket upgrade failed: %v", err)
		return
	}
	VideoUser := &UserViewer{
		ID:                        viewerID,
		Conn:                      conn,
		UserReceivingVideoDetails: make(chan VideoFrameWithAnnotations, 1000),
		done:                      make(chan struct{}),
	}
	hub.ListenForIncomingUserOrDisconnections <- &UserViewerAddition{
		User:       VideoUser,
		WantsToAdd: true,
	}
	go VideoUser.ListenForVideoDetails()
	go VideoUser.ReadPump(hub)
	go VideoUser.PingLoop()
}

func (v *UserViewer) ReadPump(hub *BroadcastServerHub) {
	defer func() {
		// Signal all goroutines to stop before closing connection
		close(v.done)
		// Give other goroutines a moment to exit cleanly
		time.Sleep(50 * time.Millisecond)
		v.Conn.Close()
		hub.ListenForIncomingUserOrDisconnections <- &UserViewerAddition{
			User:       v,
			WantsToAdd: false,
		}
	}()
	
	// Set up pong handler to keep connection alive
	v.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	v.Conn.SetPongHandler(func(string) error {
		v.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	
	for {
		if _, _, err := v.Conn.ReadMessage(); err != nil { // ok so frontend will always send in some pings and other stuff, just ignore that stuff
			log.Printf("Viewer %d ReadPump error: %v", v.ID, err)
			break
		}
	}
}

func (b *BroadcastServerHub) AddOrRemoveUser() {
	for incomingUser := range b.ListenForIncomingUserOrDisconnections {
		b.Mu.Lock()
		if incomingUser.WantsToAdd {
			if b.AcceptingUsers {
				b.Viewers[incomingUser.User.ID] = incomingUser.User
			}
		} else {
			delete(b.Viewers, incomingUser.User.ID)
		}
		b.Mu.Unlock()
	}
}

func (v *UserViewer) ListenForVideoDetails() {
	for {
		select {
		case <-v.done:
			return
		case message := <-v.UserReceivingVideoDetails:
			v.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := v.Conn.WriteJSON(message); err != nil { // happens if user ends the session
				log.Printf("Viewer %d ListenForVideoDetails error: %v", v.ID, err)
				return
			}
		}
	}
}

func (v *UserViewer) PingLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-v.done:
			return
		case <-ticker.C:
			v.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := v.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Viewer %d PingLoop error: %v", v.ID, err)
				return
			}
		}
	}
}

func (b *BroadcastServerHub) EnndBroadcastingSession() {
	for range b.EndOFStream {
		// Clean up AI session
		if b.CurrentSession != "" {
			log.Printf("Cleaning up AI session: %s", b.CurrentSession)
			if err := b.AIClient.EndSession(b.CurrentSession); err != nil {
				log.Printf("Error ending AI session: %v", err)
			}
			b.CurrentSession = ""
		}

		// Notify all viewers
		b.Mu.RLock()
		for _, viewer := range b.Viewers {
			if err := viewer.Conn.WriteMessage(websocket.TextMessage, []byte("stream has ended")); err != nil {
				continue
			}
		}
		b.Mu.RUnlock()
	}
}

func ConnectBroadCaster(hub *BroadcastServerHub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Broadcaster WebSocket upgrade failed: %v", err)
		return
	}
	
	// Clean up any existing session when new broadcaster connects
	if hub.CurrentSession != "" {
		log.Printf("New broadcaster connecting, cleaning up old session: %s", hub.CurrentSession)
		if err := hub.AIClient.EndSession(hub.CurrentSession); err != nil {
			log.Printf("Error ending old session: %v", err)
		}
		hub.CurrentSession = ""
	}
	
	defer func() {
		conn.Close()
		// Clean up AI session on broadcaster disconnect
		if hub.CurrentSession != "" {
			log.Printf("Broadcaster disconnected, cleaning up AI session: %s", hub.CurrentSession)
			if err := hub.AIClient.EndSession(hub.CurrentSession); err != nil {
				log.Printf("Error ending AI session: %v", err)
			}
			hub.CurrentSession = ""
		}
		select {
		case hub.EndOFStream <- true:
		default:

		}
	}()
	Broadcaster := &Broadcaster{
		Conn:                    conn,
		UserReadingVideoDetails: make(chan VideoFrameWithAnnotations, 1000),
	}
	
	// Start goroutine to send annotated frames back to broadcaster
	go func() {
		for frame := range Broadcaster.UserReadingVideoDetails {
			if err := Broadcaster.Conn.WriteJSON(frame); err != nil {
				log.Printf("Error sending frame to broadcaster: %v", err)
				return
			}
		}
	}()
	
	Broadcaster.ListenForVideoInput(hub)
}

func (b *Broadcaster) ListenForVideoInput(hub *BroadcastServerHub) {
	for {
		var newMessage VideoFrameValere
		err := b.Conn.ReadJSON(&newMessage)
		if err != nil {
			log.Printf("Error decoding video frame: %v", err)
			hub.EndOFStream <- true
			return
		}
		
		log.Printf("Received frame: size=%d bytes, hasRectangle=%v", len(newMessage.Frame), newMessage.HasRectangle)

		var annotatedFrame VideoFrameWithAnnotations
		
		if !newMessage.HasRectangle {
			// No annotation - pass frame through with empty metadata
			// If we had an active session, end it
			if hub.CurrentSession != "" {
				log.Printf("Rectangle cleared, ending AI session: %s", hub.CurrentSession)
				if err := hub.AIClient.EndSession(hub.CurrentSession); err != nil {
					log.Printf("Error ending AI session: %v", err)
				}
				hub.CurrentSession = ""
			}
			
			annotatedFrame = VideoFrameWithAnnotations{
				Frame:    newMessage.Frame,
				Metadata: AnnotationMetadata{},
			}
		} else {
			// Frame has annotation - process with AI service
			var metadata AnnotationMetadata

			if hub.CurrentSession == "" {
				// First annotated frame - start new session
				log.Printf("Starting new AI tracking session with bbox: x1=%.2f, y1=%.2f, x2=%.2f, y2=%.2f",
					newMessage.RectangleData.X1, newMessage.RectangleData.Y1,
					newMessage.RectangleData.X2, newMessage.RectangleData.Y2)

				sessionID, frameData, err := hub.AIClient.StartSegmentationSession(
					newMessage.Frame,
					newMessage.RectangleData,
				)

				if err != nil {
					log.Printf("AI service error starting session: %v", err)
					// Graceful degradation - send frame with empty metadata
					metadata = AnnotationMetadata{}
				} else {
					hub.CurrentSession = sessionID
					metadata = frameData
					log.Printf("AI session started: %s with %d regions detected", sessionID, frameData.MasksDetected)
				}
			} else {
				// Subsequent frame - continue tracking
				frameData, err := hub.AIClient.ProcessFrameStreaming(
					hub.CurrentSession,
					newMessage.Frame,
				)

				if err != nil {
					log.Printf("AI service error processing frame: %v", err)
					// Graceful degradation - send frame with empty metadata
					metadata = AnnotationMetadata{}
				} else {
					metadata = frameData
					
					// Check if tracking was lost (no regions detected)
					if metadata.MasksDetected == 0 {
						log.Printf("Tracking lost, restarting session with new rectangle")
						// End current session
						if endErr := hub.AIClient.EndSession(hub.CurrentSession); endErr != nil {
							log.Printf("Error ending session: %v", endErr)
						}
						hub.CurrentSession = ""
						
						// Restart with the current rectangle annotation
						sessionID, frameData, restartErr := hub.AIClient.StartSegmentationSession(
							newMessage.Frame,
							newMessage.RectangleData,
						)
						
						if restartErr != nil {
							log.Printf("AI service error restarting session: %v", restartErr)
							metadata = AnnotationMetadata{}
						} else {
							hub.CurrentSession = sessionID
							metadata = frameData
							log.Printf("Session restarted: %s with %d regions detected", sessionID, frameData.MasksDetected)
						}
					}
				}
			}

			annotatedFrame = VideoFrameWithAnnotations{
				Frame:    newMessage.Frame,
				Metadata: metadata,
			}
		}
		
		// Send frame with metadata to viewers
		hub.VideoDetailsChan <- annotatedFrame
		
		// Send frame with metadata back to broadcaster
		select {
		case b.UserReadingVideoDetails <- annotatedFrame:
		default:
			// Non-blocking send to avoid deadlock if broadcaster isn't reading
		}
	}
}

func (b *BroadcastServerHub) ShareBroadscastingDetails() {
	for message := range b.VideoDetailsChan {
		b.Mu.RLock()
		for _, viewer := range b.Viewers {
			select {
			case viewer.UserReceivingVideoDetails <- message:
			default:
				log.Printf("Warning: Dropping frame for viewer %d (channel full)", viewer.ID)
			}
		}
		b.Mu.RUnlock()
	}
}

func NewBroadcastServerHub(aiServiceURL string) *BroadcastServerHub {
	return &BroadcastServerHub{
		ValereRawVideoDetailsChan:             make(chan VideoFrameValere, 1000),
		AcceptingUsers:                        true,
		Viewers:                               make(map[int]*UserViewer),
		VideoDetailsChan:                      make(chan VideoFrameWithAnnotations, 1000),
		EndOFStream:                           make(chan bool),
		ListenForIncomingUserOrDisconnections: make(chan *UserViewerAddition, 1000),
		QandAnswer:                            make(chan QandAnswer, 100),
		Mu:                                    sync.RWMutex{},
		AIServiceURL:                          aiServiceURL,
		CurrentSession:                        "",
		AIClient:                              NewAIServiceClient(aiServiceURL, 10*time.Second),
	}
}

func (b *BroadcastServerHub) StartHubWork() {
	go b.AddOrRemoveUser()
	go b.ShareBroadscastingDetails()
	go b.EnndBroadcastingSession()
}
