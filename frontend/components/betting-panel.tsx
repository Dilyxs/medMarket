"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { SolanaDeposit } from "./solana-deposit";
import { ChevronDown } from "lucide-react";

type BetSide = "yes" | "no" | null;
type TradeType = "buy" | "sell";
type OrderType = "market" | "limit";

export function BettingPanel() {
  const [tradeType, setTradeType] = useState<TradeType>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [selectedSide, setSelectedSide] = useState<BetSide>(null);
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mock prices - probability prices (0-1) shown as cents
  const yesPrice = 0.22; // 22¢
  const noPrice = 0.79; // 79¢

  // Load user balance
  useEffect(() => {
    const loadBalance = async () => {
      try {
        const res = await fetch("/api/balance", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance || 0);
        }
      } catch {
        // Ignore errors
      }
    };
    loadBalance();
  }, []);

  const handleQuickAmount = (value: string) => {
    if (value === "Max") {
      setAmount(balance.toFixed(4));
    } else if (value.includes("%")) {
      // Percentage-based for Sell mode
      const percent = parseFloat(value.replace("%", ""));
      const calculatedAmount = (balance * percent) / 100;
      setAmount(calculatedAmount.toFixed(4));
    } else if (value.includes("SOL")) {
      // SOL-based increment/decrement
      const currentAmount = parseFloat(amount) || 0;
      const change = parseFloat(value.replace(/\s*SOL/g, ""));
      setAmount(Math.max(0, currentAmount + change).toFixed(4));
    }
  };

  const handleTrade = async () => {
    if (!selectedSide) {
      setError("Please select Yes or No");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (parseFloat(amount) > balance) {
      setError("Insufficient balance");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          side: selectedSide,
          amount: parseFloat(amount),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to place bet");
      } else {
        setMessage(`Trade executed: ${selectedSide.toUpperCase()} ${amount} SOL`);
        setAmount("");
        setSelectedSide(null);
        // Refresh balance
        const balanceRes = await fetch("/api/balance", { credentials: "include" });
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          setBalance(balanceData.balance || 0);
        }
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return `${Math.round(price * 100)}¢`;
  };

  const formatSol = (value: number) => {
    if (value === 0) return "0";
    return value.toFixed(4);
  };

  const calculateToWin = () => {
    if (!amount || !selectedSide) return 0;
    const amountNum = parseFloat(amount);
    const price = selectedSide === "yes" ? yesPrice : noPrice;
    // Calculate potential payout based on the opposite outcome
    // If you bet on Yes at 22¢, you win (1 - 0.22) = 0.78 for every $1 bet
    const potentialWin = amountNum * (1 - price);
    return potentialWin;
  };

  // Get quick buttons based on trade type and order type
  const getQuickButtons = () => {
    if (orderType === "limit") {
      // Limit mode: show increment/decrement buttons
      return ["-1 SOL", "-0.1 SOL", "+0.1 SOL", "+1 SOL"];
    } else if (tradeType === "sell") {
      // Sell mode: show percentage buttons
      return ["25%", "50%", "Max"];
    } else {
      // Buy mode: show fixed amount buttons
      return ["+0.1 SOL", "+0.5 SOL", "+1 SOL", "Max"];
    }
  };

  const quickButtons = getQuickButtons();

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex-shrink-0">
        <h2 className="text-2xl font-bold text-black tracking-tight">Place your bet</h2>
        <div className="h-1 w-24 bg-gradient-to-r from-gray-400 to-gray-500 mt-3 rounded-full"></div>
      </div>

      <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto">
        {/* Yes/No Betting Options */}
        <div className="flex gap-3">
          <button
            onClick={() => setSelectedSide("yes")}
            className={`flex-1 px-4 py-5 rounded-xl font-bold transition-all duration-300 ${
              selectedSide === "yes"
                ? "bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-lg shadow-emerald-500/40"
                : "bg-gray-100 text-black hover:bg-gray-200 shadow-md border border-gray-300"
            }`}
          >
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xl font-bold">Yes</span>
            </div>
          </button>
          <button
            onClick={() => setSelectedSide("no")}
            className={`flex-1 px-4 py-5 rounded-xl font-bold transition-all duration-300 ${
              selectedSide === "no"
                ? "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/40"
                : "bg-gray-100 text-black hover:bg-gray-200 shadow-md border border-gray-300"
            }`}
          >
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xl font-bold">No</span>
            </div>
          </button>
        </div>

        {/* Amount and To Win Side by Side */}
        <div className={`transition-all duration-500 ${amount && parseFloat(amount) > 0 ? "grid grid-cols-3 gap-4" : ""}`}>
          {/* Amount Section */}
          <div className={`space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-300 transition-all duration-500 ${amount && parseFloat(amount) > 0 ? "col-span-2" : ""}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-black uppercase tracking-wider">Amount</label>
              <div className={`text-2xl font-bold ${amount && parseFloat(amount) > 0 ? "text-black" : "text-gray-400"}`}>
                {amount && parseFloat(amount) > 0 ? formatSol(parseFloat(amount)) : "0"} SOL
              </div>
            </div>

            {/* Amount Input Field */}
            <input
              type="number"
              step="0.0001"
              min="0"
              placeholder="Enter amount in SOL"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 text-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />

            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {quickButtons.map((btn) => (
                <button
                  key={btn}
                  onClick={() => handleQuickAmount(btn)}
                  className="px-2 py-2 text-xs font-bold bg-white hover:bg-gray-100 text-black rounded-lg transition-all duration-150 active:scale-95 shadow-sm hover:shadow-md border border-gray-300"
                >
                  {btn}
                </button>
              ))}
            </div>
          </div>

          {/* To Win Section */}
          {amount && parseFloat(amount) > 0 && (
            <div className="col-span-1 flex flex-col items-center justify-center space-y-2 bg-emerald-50 p-4 rounded-xl border border-emerald-300 shadow-lg animate-in fade-in duration-500">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">To win 🔥</span>
              <div className="text-2xl font-bold text-emerald-700">
                {calculateToWin().toFixed(2)} SOL
              </div>
              <span className="text-xs text-gray-600 text-center">Avg. Price {selectedSide ? formatPrice(selectedSide === "yes" ? yesPrice : noPrice) : "-"}</span>
            </div>
          )}
        </div>

        {/* Trade Button */}
        <Button
          onClick={handleTrade}
          disabled={loading || !selectedSide || !amount || parseFloat(amount) <= 0}
          className="w-full py-5 text-lg font-bold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white disabled:from-gray-400 disabled:to-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed rounded-xl transition-all duration-200 shadow-lg hover:shadow-2xl disabled:shadow-none"
        >
          {loading ? "Processing..." : "Trade"}
        </Button>

        {/* Messages */}
        {error && (
          <div className="text-sm text-red-800 bg-red-100 p-4 rounded-xl border border-red-300 font-semibold shadow-md">
            {error}
          </div>
        )}
        {message && (
          <div className="text-sm text-emerald-800 bg-emerald-100 p-4 rounded-xl border border-emerald-300 font-semibold shadow-md">
            {message}
          </div>
        )}

        {/* Balance Display */}
        <div className="text-sm text-gray-600 text-center pt-2 font-semibold">
          Balance: <span className="text-black font-bold">{balance.toFixed(4)} SOL</span>
        </div>

        {/* Solana Deposit */}
        <div className="mt-auto pt-6 border-t border-gray-300">
          <SolanaDeposit />
        </div>
      </div>
    </div>
  );
}
