package pkg

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

// AIServiceClient handles communication with the Python AI service
type AIServiceClient struct {
	BaseURL string
	Timeout time.Duration
	client  *http.Client
}

// NewAIServiceClient creates a new AI service client
func NewAIServiceClient(baseURL string, timeout time.Duration) *AIServiceClient {
	return &AIServiceClient{
		BaseURL: baseURL,
		Timeout: timeout,
		client:  &http.Client{Timeout: timeout},
	}
}

// StreamStartResponse represents the response from /stream/start
type StreamStartResponse struct {
	Status    string             `json:"status"`
	SessionID string             `json:"session_id"`
	FrameData AnnotationMetadata `json:"frame_data"`
}

// StreamFrameResponse represents the response from /stream/frame
type StreamFrameResponse struct {
	Status    string             `json:"status"`
	FrameData AnnotationMetadata `json:"frame_data"`
	Message   string             `json:"message,omitempty"`
}

// StreamEndResponse represents the response from /stream/end
type StreamEndResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// HealthResponse represents the response from /health
type HealthResponse struct {
	Status      string `json:"status"`
	ModelLoaded bool   `json:"model_loaded"`
}

// CheckHealth checks if the AI service is ready
func (c *AIServiceClient) CheckHealth() (*HealthResponse, error) {
	resp, err := c.client.Get(c.BaseURL + "/health")
	if err != nil {
		return nil, fmt.Errorf("failed to connect to AI service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AI service health check failed with status %d", resp.StatusCode)
	}

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return nil, fmt.Errorf("failed to decode health response: %w", err)
	}

	return &health, nil
}

// StartSegmentationSession starts a new tracking session with initial bounding box
func (c *AIServiceClient) StartSegmentationSession(frameBytes []byte, rectangle RectangleDataValere) (string, AnnotationMetadata, error) {
	// Convert rectangle to bbox format [[x1, y1, x2, y2]]
	bboxes := [][]float64{{rectangle.X1, rectangle.Y1, rectangle.X2, rectangle.Y2}}
	bboxesJSON, err := json.Marshal(bboxes)
	if err != nil {
		return "", AnnotationMetadata{}, fmt.Errorf("failed to marshal bboxes: %w", err)
	}

	// Create multipart form data
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Add bboxes field
	if err := writer.WriteField("bboxes", string(bboxesJSON)); err != nil {
		return "", AnnotationMetadata{}, fmt.Errorf("failed to write bboxes field: %w", err)
	}

	// Add image field
	part, err := writer.CreateFormFile("image", "frame.jpg")
	if err != nil {
		return "", AnnotationMetadata{}, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := part.Write(frameBytes); err != nil {
		return "", AnnotationMetadata{}, fmt.Errorf("failed to write frame data: %w", err)
	}

	// Close writer to finalize multipart message
	contentType := writer.FormDataContentType()
	if err := writer.Close(); err != nil {
		return "", AnnotationMetadata{}, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	// Send request
	resp, err := c.client.Post(c.BaseURL+"/stream/start", contentType, &buf)
	if err != nil {
		return "", AnnotationMetadata{}, fmt.Errorf("failed to send start request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", AnnotationMetadata{}, fmt.Errorf("AI service returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var startResp StreamStartResponse
	if err := json.NewDecoder(resp.Body).Decode(&startResp); err != nil {
		return "", AnnotationMetadata{}, fmt.Errorf("failed to decode start response: %w", err)
	}

	return startResp.SessionID, startResp.FrameData, nil
}

// ProcessFrameStreaming processes a frame in an existing session
func (c *AIServiceClient) ProcessFrameStreaming(sessionID string, frameBytes []byte) (AnnotationMetadata, error) {
	// Create multipart form data
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Add session_id field
	if err := writer.WriteField("session_id", sessionID); err != nil {
		return AnnotationMetadata{}, fmt.Errorf("failed to write session_id field: %w", err)
	}

	// Add image field
	part, err := writer.CreateFormFile("image", "frame.jpg")
	if err != nil {
		return AnnotationMetadata{}, fmt.Errorf("failed to create form file: %w", err)
	}
	if _, err := part.Write(frameBytes); err != nil {
		return AnnotationMetadata{}, fmt.Errorf("failed to write frame data: %w", err)
	}

	// Close writer
	contentType := writer.FormDataContentType()
	if err := writer.Close(); err != nil {
		return AnnotationMetadata{}, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	// Send request
	resp, err := c.client.Post(c.BaseURL+"/stream/frame", contentType, &buf)
	if err != nil {
		return AnnotationMetadata{}, fmt.Errorf("failed to send frame request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return AnnotationMetadata{}, fmt.Errorf("AI service returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var frameResp StreamFrameResponse
	if err := json.NewDecoder(resp.Body).Decode(&frameResp); err != nil {
		return AnnotationMetadata{}, fmt.Errorf("failed to decode frame response: %w", err)
	}

	return frameResp.FrameData, nil
}

// EndSession ends a tracking session and cleans up resources
func (c *AIServiceClient) EndSession(sessionID string) error {
	if sessionID == "" {
		return nil // No session to end
	}

	// Create form data
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	if err := writer.WriteField("session_id", sessionID); err != nil {
		return fmt.Errorf("failed to write session_id: %w", err)
	}
	contentType := writer.FormDataContentType()
	writer.Close()

	// Send request
	resp, err := c.client.Post(c.BaseURL+"/stream/end", contentType, &buf)
	if err != nil {
		return fmt.Errorf("failed to send end request: %w", err)
	}
	defer resp.Body.Close()

	// We don't strictly need to check the response for cleanup
	// but let's log if there's an issue
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("AI service returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
