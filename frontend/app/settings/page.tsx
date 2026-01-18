"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface User {
  _id?: string;
  userId?: string;
  email: string;
  name?: string | null;
  newsletter?: boolean;
  balance?: number;
  wallet?: {
    address?: string;
  };
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [balance, setBalance] = useState(0);
  const [tokens, setTokens] = useState(0);
  const [solToConvert, setSolToConvert] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawWallet, setWithdrawWallet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [regeneratingWallet, setRegeneratingWallet] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          router.push("/auth/sign-in");
          return;
        }
        const data = await res.json();
        const u = data.user as User;
        setUser(u);
        setName(u?.name || "");
        setNewsletter(Boolean(u?.newsletter));

        // Load user profile with balance and wallet
        const profileRes = await fetch("/api/user/profile", { credentials: "include" });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          console.log("Profile data:", profileData);
          setBalance(profileData.balance || 0);
          setTokens(profileData.tokens || 0);
          if (profileData.wallet?.address) {
            setWalletAddress(profileData.wallet.address);
          } else {
            // Try to create wallet if it doesn't exist
            console.log("No wallet found, creating one...");
            const createRes = await fetch("/api/wallet/create", {
              method: "POST",
              credentials: "include"
            });
            if (createRes.ok) {
              const createData = await createRes.json();
              setWalletAddress(createData.wallet.address);
              console.log("Wallet created:", createData.wallet.address);
            } else {
              setWalletAddress("Error creating wallet");
            }
          }
        } else {
          console.error("Profile fetch failed:", profileRes.status);
          setWalletAddress("Error loading wallet");
        }
      } catch (err) {
        console.error("Settings load error:", err);
        setWalletAddress("Error loading wallet");
        router.push("/auth/sign-in");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const handleRegenerateWallet = async () => {
    setRegeneratingWallet(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/wallet/regenerate", {
        method: "POST",
        credentials: "include"
      });
      
      if (res.ok) {
        const data = await res.json();
        setWalletAddress(data.wallet.address);
        setMessage("Wallet regenerated successfully!");
      } else {
        setError("Failed to regenerate wallet");
      }
    } catch (err) {
      setError("Error regenerating wallet");
      console.error(err);
    } finally {
      setRegeneratingWallet(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, newsletter }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update");
      } else {
        setUser(data.user);
        setMessage("Profile updated");
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete your account? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/user", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete");
      } else {
        router.push("/auth/sign-in");
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setDeleting(false);
    }
  };

  const handleWithdraw = async () => {
    console.log("Withdraw button clicked", { withdrawAmount, balance, walletAddress, withdrawWallet });
    
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (parseFloat(withdrawAmount) > balance) {
      setError("Insufficient balance");
      return;
    }

    setWithdrawing(true);
    setError(null);
    setMessage(null);

    try {
      console.log("Calling /api/withdraw with:", {
        amount: parseFloat(withdrawAmount),
        walletAddress: withdrawWallet || walletAddress,
      });

      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: parseFloat(withdrawAmount),
          walletAddress: withdrawWallet || walletAddress, // Use provided address or user's own wallet
        }),
      });

      console.log("Withdraw response:", res.status, res.statusText);

      const data = await res.json();
      console.log("Withdraw response data:", data);
      
      if (!res.ok) {
        setError(data.error || "Failed to withdraw");
      } else {
        setMessage(`Withdrawal of ${withdrawAmount} SOL initiated to ${withdrawWallet || walletAddress}`);
        setWithdrawAmount("");
        setWithdrawWallet("");
        // Refresh balance
        const profileRes = await fetch("/api/user/profile", { credentials: "include" });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setBalance(profileData.balance || 0);
          setTokens(profileData.tokens || 0);
        }
      }
    } catch (err) {
      console.error("Withdraw error:", err);
      setError("Unexpected error");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleConvertTokens = async () => {
    if (!solToConvert || parseFloat(solToConvert) <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (parseFloat(solToConvert) > balance) {
      setError("Insufficient SOL balance");
      return;
    }

    setConverting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/tokens/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          solAmount: parseFloat(solToConvert),
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Failed to convert tokens");
      } else {
        setMessage(`Converted ${data.sol_converted} SOL to ${data.tokens_received} tokens`);
        setBalance(data.new_sol_balance);
        setTokens(data.new_token_balance);
        setSolToConvert("");
      }
    } catch (err) {
      console.error("Token conversion error:", err);
      setError("Unexpected error");
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your account and wallet</p>
        </div>

        {/* Solana Wallet Section */}
        <div className="rounded-lg border border-border bg-card p-8 space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Solana Wallet</h2>
              <p className="text-sm text-muted-foreground">Your personal wallet for deposits and withdrawals</p>
            </div>
          </div>

          {/* Wallet Address Card */}
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-4 border border-primary/20 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wallet Address</p>
            {walletAddress && walletAddress !== "Loading..." && !walletAddress.includes("Error") ? (
              <div className="flex items-start gap-3">
                <code className="flex-1 text-sm font-mono text-foreground break-all bg-background rounded px-3 py-2 border border-border">
                  {walletAddress}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(walletAddress)}
                  className="px-3 py-2 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                {walletAddress || "Loading..."}
              </div>
            )}
          </div>

          {/* Balance Display */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-muted rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">SOL Balance</p>
              <p className="text-2xl font-bold text-foreground">{balance.toFixed(4)}</p>
              <p className="text-xs text-muted-foreground mt-1">SOL available</p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Game Tokens</p>
              <p className="text-2xl font-bold text-primary">{tokens.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">For quiz betting</p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Rate</p>
              <p className="text-2xl font-bold text-foreground">200</p>
              <p className="text-xs text-muted-foreground mt-1">Tokens per SOL</p>
            </div>
          </div>

          {/* Token Conversion */}
          <div className="border-t border-border pt-6 space-y-4">
            <h3 className="font-semibold text-foreground">Convert SOL to Tokens</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="solToConvert" className="text-sm font-medium">SOL Amount</Label>
                <Input
                  id="solToConvert"
                  type="number"
                  step="0.01"
                  min="0"
                  max={balance}
                  placeholder="0.00"
                  value={solToConvert}
                  onChange={(e) => setSolToConvert(e.target.value)}
                  className="mt-1"
                />
                {solToConvert && parseFloat(solToConvert) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    = {(parseFloat(solToConvert) * 200).toFixed(2)} tokens
                  </p>
                )}
              </div>

              <Button
                onClick={handleConvertTokens}
                disabled={converting || !solToConvert || parseFloat(solToConvert) <= 0 || parseFloat(solToConvert) > balance}
                className="w-full h-10 bg-primary"
              >
                {converting ? "Converting..." : "Convert to Tokens"}
              </Button>
            </div>
          </div>

          {/* Withdraw Section */}
          <div className="border-t border-border pt-6 space-y-4">
            <h3 className="font-semibold text-foreground">Withdraw from App</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="withdrawAmount" className="text-sm font-medium">Amount (SOL)</Label>
                <Input
                  id="withdrawAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  max={balance}
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="withdrawWallet" className="text-sm font-medium">
                  Send to Address (optional - uses your wallet if empty)
                </Label>
                <Input
                  id="withdrawWallet"
                  type="text"
                  placeholder={walletAddress || "Your wallet address"}
                  value={withdrawWallet}
                  onChange={(e) => setWithdrawWallet(e.target.value)}
                  className="mt-1 font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to withdraw to your own wallet
                </p>
              </div>

              <Button
                onClick={handleWithdraw}
                disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                className="w-full h-10"
              >
                {withdrawing ? "Processing..." : "Withdraw SOL"}
              </Button>
            </div>
          </div>
        </div>

        {/* Account Section */}
        <div className="rounded-lg border border-border bg-card p-8 space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Account</h2>
              <p className="text-sm text-muted-foreground">Manage your profile information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input 
                id="email" 
                value={user?.email ?? ""} 
                disabled 
                className="mt-1 bg-muted"
              />
            </div>

            <div>
              <Label htmlFor="name" className="text-sm font-medium">Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
              <Checkbox
                id="newsletter"
                checked={newsletter}
                onChange={(e) => setNewsletter(e.target.checked)}
              />
              <Label htmlFor="newsletter" className="text-sm font-normal cursor-pointer">
                Subscribe to newsletter for updates
              </Label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => router.push("/")}
              className="flex-1"
            >
              Back Home
            </Button>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4">
            <p className="text-sm text-green-800">{message}</p>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Danger Zone */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
              <p className="text-sm text-muted-foreground">Irreversible actions</p>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Delete your account and all associated data permanently.
          </p>
          
          <Button
            className="w-full bg-destructive hover:bg-destructive/90"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
