"use client";

import { LiveBroadcastViewer } from "@/components/live-broadcast";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function ViewerPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background flex flex-col p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-3xl font-bold">Viewer Stream</h1>
      </div>

      <div className="flex-1 flex justify-center items-center">
         <div className="w-full max-w-4xl aspect-video">
            <LiveBroadcastViewer />
         </div>
      </div>
    </div>
  );
}
