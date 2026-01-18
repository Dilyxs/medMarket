"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function WalletDepositPanel() {
  const [amount, setAmount] = useState("0.1");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");

  const handleSimulateDeposit = async () => {
    setLoading(true);
    setMessage("");
    setSignature("");

    try {
      // In test mode, simulate a deposit transaction
      const fakeSignature = `deposit-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      setSignature(fakeSignature);

      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: parseFloat(amount),
          signature: fakeSignature
        })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(`✅ ${data.message} | New Balance: ${data.new_balance.toFixed(4)} SOL`);
        setAmount("0.1");
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
    <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">💰</span>
        <div>
          <h3 className="font-semibold text-blue-900">Deposit to App</h3>
          <p className="text-xs text-blue-700">Transfer SOL from your wallet to the app</p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount in SOL"
          className="flex-1"
        />
        <Button 
          onClick={handleSimulateDeposit}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? "Depositing..." : "Deposit"}
        </Button>
      </div>

      {message && (
        <div className="text-sm p-2 bg-white rounded border border-blue-300">
          {message}
        </div>
      )}

      {signature && (
        <div className="text-xs p-2 bg-blue-100 rounded border border-blue-300">
          <p className="font-mono break-all">TX: {signature}</p>
        </div>
      )}

      <div className="text-xs text-blue-700 space-y-1">
        <p>• Transfer SOL to deposit into the app</p>
        <p>• 0.00005 SOL network fee deducted</p>
        <p>• Instant balance update</p>
      </div>
    </div>
  );
}
