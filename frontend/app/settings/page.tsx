"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface User {
  _id?: string;
  email: string;
  name?: string | null;
  newsletter?: boolean;
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [balance, setBalance] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawWallet, setWithdrawWallet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

        // Load balance
        const balanceRes = await fetch("/api/balance", { credentials: "include" });
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          setBalance(balanceData.balance || 0);
        }
      } catch {
        router.push("/auth/sign-in");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

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
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (parseFloat(withdrawAmount) > balance) {
      setError("Insufficient balance");
      return;
    }
    if (!withdrawWallet || withdrawWallet.trim() === "") {
      setError("Please enter a wallet address");
      return;
    }

    setWithdrawing(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: parseFloat(withdrawAmount),
          walletAddress: withdrawWallet.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to withdraw");
      } else {
        setMessage(`Withdrawal request submitted: ${withdrawAmount} SOL to ${withdrawWallet}`);
        setWithdrawAmount("");
        setWithdrawWallet("");
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
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Account settings</h1>
          <p className="text-sm text-muted-foreground">Update your profile or delete your account.</p>
        </div>

        {/* Balance Section */}
        <div className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Account Balance</h2>
            <div className="text-3xl font-bold text-foreground mb-1">
              {balance.toFixed(4)} SOL
            </div>
            <p className="text-sm text-muted-foreground">
              This is the balance the web app owes you from your winnings. You can withdraw at any time.
            </p>
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="withdrawAmount">Withdraw Amount (SOL)</Label>
              <Input
                id="withdrawAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdrawWallet">Solana Wallet Address</Label>
              <Input
                id="withdrawWallet"
                placeholder="Enter your Solana wallet address"
                value={withdrawWallet}
                onChange={(e) => setWithdrawWallet(e.target.value)}
              />
            </div>

            <Button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAmount || !withdrawWallet}
              className="w-full"
            >
              {withdrawing ? "Processing..." : "Withdraw"}
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user?.email ?? ""} disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="newsletter"
              checked={newsletter}
              onChange={(e) => setNewsletter(e.target.checked)}
            />
            <Label htmlFor="newsletter" className="text-sm font-normal">
              Subscribe to newsletter
            </Label>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/")}>Back home</Button>
          </div>

          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
          <p className="text-sm text-muted-foreground">Delete your account and all data.</p>
          <Button
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
