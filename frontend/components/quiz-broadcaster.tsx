"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

interface Question {
  id: string;
  question: string;
  options: string[];
  time_limit: number;
  created_at: string;
}

interface QueuedQuestion extends Question {
  queue_position: number;
}

export function QuizBroadcaster() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [timeLimit, setTimeLimit] = useState(30);
  const [queuedQuestions, setQueuedQuestions] = useState<QueuedQuestion[]>([]);
  const [isQuestionLive, setIsQuestionLive] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [remainingPlayers, setRemainingPlayers] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const websocket = new WebSocket("ws://localhost:8080/quiz-broadcaster");
    
    websocket.onopen = () => {
      console.log("Quiz broadcaster connected");
      setConnected(true);
    };
    
    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Broadcaster received:", data);
        
        switch (data.type) {
          case "question_queued":
            setQueuedQuestions(prev => [...prev, { ...data.question, queue_position: data.queue_position }]);
            break;
            
          case "question_live":
            setIsQuestionLive(true);
            // Remove from queue if it was queued
            setQueuedQuestions(prev => prev.slice(1));
            break;
            
          case "ready_for_question":
            setIsQuestionLive(false);
            setRemainingPlayers(data.remaining_players || 0);
            break;
            
          case "results":
            console.log("Question results:", data);
            setRemainingPlayers(data.remaining_players);
            break;
            
          case "game_ended":
            setGameEnded(true);
            setIsQuestionLive(false);
            setQueuedQuestions([]);
            console.log("Game ended:", data.results);
            break;
        }
      } catch (err) {
        console.error("Failed to parse broadcaster message:", err);
      }
    };
    
    websocket.onerror = (error) => {
      console.error("Quiz broadcaster WebSocket error:", error);
    };
    
    websocket.onclose = () => {
      console.log("Quiz broadcaster disconnected");
      setConnected(false);
    };
    
    setWs(websocket);
    wsRef.current = websocket;
    
    return () => {
      websocket.close();
    };
  }, []);

  const addOption = () => {
    if (options.length < 4) {
      setOptions([...options, ""]);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
      if (correctIndex >= newOptions.length) {
        setCorrectIndex(newOptions.length - 1);
      }
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = () => {
    // Validate
    const filledOptions = options.filter(opt => opt.trim() !== "");
    
    if (!question.trim()) {
      alert("Please enter a question");
      return;
    }
    
    if (filledOptions.length < 2) {
      alert("Please provide at least 2 options");
      return;
    }
    
    if (correctIndex >= filledOptions.length) {
      alert("Invalid correct answer selection");
      return;
    }
    
    if (timeLimit < 5 || timeLimit > 300) {
      alert("Time limit must be between 5 and 300 seconds");
      return;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert("Not connected to server");
      return;
    }
    
    // Send question to backend
    ws.send(JSON.stringify({
      type: "submit_question",
      question: question.trim(),
      options: filledOptions,
      correct_index: correctIndex,
      time_limit: timeLimit
    }));
    
    // Reset form
    setQuestion("");
    setOptions(["", ""]);
    setCorrectIndex(0);
    setTimeLimit(30);
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Quiz Control</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-muted-foreground">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {gameEnded && (
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <p className="text-sm font-medium text-yellow-800">
            Game has ended. Refresh to start a new session.
          </p>
        </Card>
      )}

      {!gameEnded && (
        <>
          {/* Status */}
          <Card className="p-3 bg-muted">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span className={`font-medium ${isQuestionLive ? 'text-red-500' : 'text-green-600'}`}>
                {isQuestionLive ? 'Question Live' : 'Ready for Question'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-muted-foreground">Players:</span>
              <span className="font-medium">{remainingPlayers}</span>
            </div>
          </Card>

          {/* Question Form */}
          <Card className="p-4 space-y-4">
            <div>
              <Label htmlFor="question">Question</Label>
              <Input
                id="question"
                placeholder="Enter your question..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Answer Options ({options.length}/4)</Label>
                {options.length < 4 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addOption}
                    className="h-8 px-3 text-xs"
                  >
                    + Add Option
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground w-6">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <Input
                      placeholder={`Option ${index + 1}`}
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      className="flex-1"
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeOption(index)}
                        className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="correctAnswer">Correct Answer</Label>
                <select
                  id="correctAnswer"
                  value={correctIndex}
                  onChange={(e) => setCorrectIndex(parseInt(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                >
                  {options.map((_, index) => (
                    <option key={index} value={index}>
                      Option {String.fromCharCode(65 + index)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="timeLimit">Time Limit (seconds)</Label>
                <Input
                  id="timeLimit"
                  type="number"
                  min="5"
                  max="300"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value) || 30)}
                  className="mt-1"
                />
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!connected || !question.trim() || options.filter(o => o.trim()).length < 2}
              className="w-full"
            >
              {isQuestionLive ? 'Queue Question' : 'Submit Question'}
            </Button>
          </Card>

          {/* Queued Questions */}
          {queuedQuestions.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Queued Questions ({queuedQuestions.length})
              </h3>
              <div className="space-y-2">
                {queuedQuestions.map((q, index) => (
                  <div key={q.id} className="p-2 bg-muted rounded text-sm">
                    <div className="font-medium">#{index + 1}: {q.question}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {q.options.length} options • {q.time_limit}s
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
