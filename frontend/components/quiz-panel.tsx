"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  time_limit: number;
  start_time: number;
}

interface BetState {
  bets: number[];
  submitted: boolean;
}

interface PlayerResult {
  bets: number[];
  won: boolean;
  tokens_returned: number;
  tokens_lost: number;
  new_balance: number;
}

interface QuizResults {
  type: string;
  question_id: string;
  correct_index: number;
  eliminated_players: string[];
  remaining_players: number;
  jackpot: number;
  player_results: { [key: string]: PlayerResult };
}

export function QuizPanel() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [tokens, setTokens] = useState(50);
  const [bets, setBets] = useState<number[]>([]);
  const [betSubmitted, setBetSubmitted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isEliminated, setIsEliminated] = useState(false);
  const [jackpot, setJackpot] = useState(0);
  const [remainingPlayers, setRemainingPlayers] = useState(0);
  const [lastResult, setLastResult] = useState<PlayerResult | null>(null);
  const [gameEnded, setGameEnded] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Get user info from session
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          console.error("Not authenticated");
          return;
        }
        const data = await res.json();
        const user = data.user;
        
        if (!user) {
          console.error("No user data");
          return;
        }
        
        setUserId(user._id || user.userId);
        
        // Connect to quiz WebSocket
        const username = user.name || user.email;
        const email = user.email;
        const userIdParam = user._id || user.userId;
        
        const websocket = new WebSocket(
          `ws://localhost:8080/quiz-viewer?userId=${encodeURIComponent(userIdParam)}&username=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`
        );
        
        websocket.onopen = () => {
          console.log("Quiz player connected");
          setConnected(true);
        };
        
        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("Player received:", data);
            
            switch (data.type) {
              case "game_state":
                setTokens(data.tokens || 50);
                setIsActive(data.is_active);
                setJackpot(data.jackpot || 0);
                if (data.current_question) {
                  handleNewQuestion(data.current_question);
                }
                break;
                
              case "new_question":
                handleNewQuestion(data.question);
                break;
                
              case "bet_confirmed":
                setBetSubmitted(true);
                setTokens(data.new_balance);
                break;
                
              case "results":
                handleResults(data);
                break;
                
              case "eliminated":
                setIsEliminated(true);
                setIsActive(false);
                break;
                
              case "game_ended":
                setGameEnded(true);
                setCurrentQuestion(null);
                if (data.results) {
                  handleResults(data.results);
                }
                break;
            }
          } catch (err) {
            console.error("Failed to parse quiz message:", err);
          }
        };
        
        websocket.onerror = (error) => {
          console.error("Quiz WebSocket error:", error);
        };
        
        websocket.onclose = () => {
          console.log("Quiz player disconnected");
          setConnected(false);
        };
        
        setWs(websocket);
        
        return () => {
          websocket.close();
        };
      } catch (err) {
        console.error("Failed to load user:", err);
      }
    };
    
    loadUser();
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleNewQuestion = (question: QuizQuestion) => {
    setCurrentQuestion(question);
    setBets(new Array(question.options.length).fill(0));
    setBetSubmitted(false);
    setLastResult(null);
    
    // Start countdown timer
    const startTime = question.start_time;
    const endTime = startTime + (question.time_limit * 1000);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }
    }, 100);
  };

  const handleResults = (results: QuizResults) => {
    setJackpot(results.jackpot);
    setRemainingPlayers(results.remaining_players);
    
    if (userId && results.player_results && results.player_results[userId]) {
      const result = results.player_results[userId];
      setLastResult(result);
      setTokens(result.new_balance);
      
      if (!result.won) {
        setIsActive(false);
      }
    }
    
    // Clear current question after delay
    setTimeout(() => {
      setCurrentQuestion(null);
    }, 3000);
  };

  const updateBet = (index: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    const newBets = [...bets];
    newBets[index] = Math.max(0, numValue);
    setBets(newBets);
  };

  const getTotalBet = () => {
    return bets.reduce((sum, bet) => sum + bet, 0);
  };

  const handleSubmitBet = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !currentQuestion) {
      return;
    }
    
    const totalBet = getTotalBet();
    
    if (totalBet > tokens) {
      alert("Insufficient tokens!");
      return;
    }
    
    // Must bet something
    const hasBet = bets.some(b => b > 0);
    if (!hasBet) {
      alert("You must place at least one bet!");
      return;
    }
    
    ws.send(JSON.stringify({
      type: "submit_bet",
      question_id: currentQuestion.id,
      bets: bets
    }));
  };

  if (isEliminated) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-6xl mb-4">💀</div>
        <h2 className="text-2xl font-bold text-red-600 mb-2">You've Been Eliminated!</h2>
        <p className="text-muted-foreground">
          You didn't bet on the correct answer. Better luck next time!
        </p>
      </div>
    );
  }

  if (gameEnded) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-6xl mb-4">🏁</div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Game Ended!</h2>
        {lastResult && lastResult.won ? (
          <>
            <div className="text-5xl mb-2">🎉</div>
            <p className="text-xl font-semibold text-green-600 mb-2">You Won!</p>
            <p className="text-lg text-foreground">Final Balance: {tokens.toFixed(2)} tokens</p>
          </>
        ) : (
          <p className="text-muted-foreground">Thanks for playing!</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Quiz Time!</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-muted-foreground">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 bg-muted">
          <div className="text-xs text-muted-foreground mb-1">Your Tokens</div>
          <div className="text-lg font-bold text-foreground">{tokens.toFixed(2)}</div>
        </Card>
        <Card className="p-3 bg-muted">
          <div className="text-xs text-muted-foreground mb-1">Jackpot</div>
          <div className="text-lg font-bold text-yellow-600">{jackpot.toFixed(2)}</div>
        </Card>
        <Card className="p-3 bg-muted">
          <div className="text-xs text-muted-foreground mb-1">Players</div>
          <div className="text-lg font-bold text-foreground">{remainingPlayers}</div>
        </Card>
      </div>

      {/* Last Result */}
      {lastResult && !currentQuestion && (
        <Card className={`p-4 ${lastResult.won ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{lastResult.won ? '✅' : '❌'}</span>
            <span className={`font-semibold ${lastResult.won ? 'text-green-700' : 'text-red-700'}`}>
              {lastResult.won ? 'Correct!' : 'Wrong Answer'}
            </span>
          </div>
          <div className="text-sm">
            {lastResult.won ? (
              <p className="text-green-700">
                Returned: {lastResult.tokens_returned.toFixed(2)} tokens
                {lastResult.tokens_lost > 0 && ` • Lost: ${lastResult.tokens_lost.toFixed(2)} tokens`}
              </p>
            ) : (
              <p className="text-red-700">
                Lost: {lastResult.tokens_lost.toFixed(2)} tokens to jackpot
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Question or Waiting */}
      {currentQuestion ? (
        <Card className="p-4 flex-1 flex flex-col">
          {/* Timer */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-muted-foreground">Time Remaining</span>
              <span className={`text-2xl font-bold ${timeRemaining <= 5 ? 'text-red-600' : 'text-foreground'}`}>
                {timeRemaining}s
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${timeRemaining <= 5 ? 'bg-red-500' : 'bg-primary'}`}
                style={{ width: `${(timeRemaining / currentQuestion.time_limit) * 100}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">{currentQuestion.question}</h3>
          </div>

          {/* Options with Betting */}
          <div className="space-y-3 flex-1">
            {currentQuestion.options.map((option, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-full font-semibold">
                  {String.fromCharCode(65 + index)}
                </div>
                <div className="flex-1 text-sm font-medium text-foreground">{option}</div>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  max={tokens}
                  placeholder="0"
                  value={bets[index] || ""}
                  onChange={(e) => updateBet(index, e.target.value)}
                  disabled={betSubmitted || timeRemaining <= 0}
                  className="w-24 text-right"
                />
              </div>
            ))}
          </div>

          {/* Bet Summary */}
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Bet:</span>
              <span className={`font-semibold ${getTotalBet() > tokens ? 'text-red-600' : 'text-foreground'}`}>
                {getTotalBet().toFixed(2)} / {tokens.toFixed(2)} tokens
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmitBet}
            disabled={betSubmitted || timeRemaining <= 0 || getTotalBet() > tokens || getTotalBet() === 0}
            className="w-full mt-4"
          >
            {betSubmitted ? 'Bet Submitted ✓' : 'Submit Bet'}
          </Button>
        </Card>
      ) : (
        <Card className="p-8 flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-5xl mb-4">⏳</div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Waiting for Next Question...</h3>
          <p className="text-sm text-muted-foreground">
            The broadcaster will send the next question shortly.
          </p>
        </Card>
      )}
    </div>
  );
}
