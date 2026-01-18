#!/bin/bash

# Kill ports
echo "Stopping existing services..."
lsof -ti:8080 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null

# Start Go Backend
echo "Starting Go Backend..."
cd backend/server
nohup go run main.go > backend.log 2>&1 &
GO_PID=$!
echo "Go Backend started (PID: $GO_PID)"

# Start AI Service
echo "Starting AI Service..."
cd ../../backend/ai_service
# Ensure executable
chmod +x run.sh
# Run in background
nohup ./run.sh > ai_service.log 2>&1 &
AI_PID=$!
echo "AI Service started (PID: $AI_PID)"

echo "Services are restarting. Please wait 10 seconds for initialization..."
sleep 10
echo "Done."
