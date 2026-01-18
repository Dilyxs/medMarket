"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";

export function SolanaDepositCard() {
  const [depositAddress, setDepositAddress] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDepositAddress = async () => {
      try {
        const res = await fetch("/api/deposit", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setDepositAddress(data.deposit_address || process.env.NEXT_PUBLIC_SOL_RECEIVER || "");
        }
      } catch (err) {
        console.error("Failed to load deposit address:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDepositAddress();
  }, []);

  const handleCopyAddress = () => {
    if (depositAddress) {
      navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return <div className="text-center text-sm text-gray-500">Loading deposit address...</div>;
  }

  return (
    <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
      <div className="text-sm font-semibold text-blue-900">💰 Deposit SOL</div>
      
      <div className="text-xs text-blue-700">
        Send SOL to this address. Your balance will be credited within 1-2 minutes.
      </div>

      {depositAddress && (
        <div className="space-y-2">
          <div className="bg-white p-2 rounded border border-blue-300 break-all text-xs font-mono text-gray-700">
            {depositAddress}
          </div>
          <Button
            onClick={handleCopyAddress}
            className="w-full px-3 py-2 text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            {copied ? "✓ Copied!" : "Copy Address"}
          </Button>
        </div>
      )}

      <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
        Network: <span className="font-semibold">Devnet</span> (testnet SOL)
      </div>
    </div>
  );
}
