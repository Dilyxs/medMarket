#!/bin/bash
echo "Stopping all services..."

# Find and kill process on port 8080 (Go Backend)
PID_GO=$(lsof -ti:8080)
if [ -n "$PID_GO" ]; then
    echo "Killing Go Backend on port 8080 (PID: $PID_GO)"
    kill -9 $PID_GO
else
    echo "No process found on port 8080."
fi

# Find and kill process on port 8000 (AI Service)
PID_AI=$(lsof -ti:8000)
if [ -n "$PID_AI" ]; then
    echo "Killing AI Service on port 8000 (PID: $PID_AI)"
    kill -9 $PID_AI
else
    echo "No process found on port 8000."
fi

# Find and kill process on port 3000 (Next.js Frontend) - Optional but good for "stop everything"
PID_FRONT=$(lsof -ti:3000)
if [ -n "$PID_FRONT" ]; then
    echo "Killing Frontend on port 3000 (PID: $PID_FRONT)"
    kill -9 $PID_FRONT
else
    echo "No process found on port 3000."
fi

echo "All services stopped."
