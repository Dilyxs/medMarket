"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function TestDepositPanel() {
  const [amount, setAmount] = useState("1.0");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleTestDeposit = async () => {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/test-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: parseFloat(amount) })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(`✅ ${data.message} | New Balance: ${data.new_balance.toFixed(4)} SOL`);
        setAmount("1.0");
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (err) {
      setMessage(`❌ Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🧪</span>
        <div>
          <h3 className="font-semibold text-yellow-900">Test Mode Active</h3>
          <p className="text-xs text-yellow-700">Add fake SOL to test the app</p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <Input
          type="number"
          step="0.1"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount in SOL"
          className="flex-1"
        />
        <Button 
          onClick={handleTestDeposit}
          disabled={loading}
          className="bg-yellow-600 hover:bg-yellow-700 text-white"
        >
          {loading ? "Adding..." : "Add Test SOL"}
        </Button>
      </div>

      {message && (
        <div className="text-sm p-2 bg-white rounded border border-yellow-300">
          {message}
        </div>
      )}

      <div className="text-xs text-yellow-700 space-y-1">
        <p>• No real blockchain transactions</p>
        <p>• Instant balance updates</p>
        <p>• Perfect for testing features</p>
      </div>
    </div>
  );
}
