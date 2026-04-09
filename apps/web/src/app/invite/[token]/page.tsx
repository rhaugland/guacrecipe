"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getSessionToken } from "../../../lib/api-client";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [info, setInfo] = useState<{ workspaceName: string; memberCount: number } | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!getSessionToken());
    api.workspaces.inviteInfo(token)
      .then(setInfo)
      .catch((err) => setError(err.message ?? "Invalid invite link"));
  }, [token]);

  const handleJoin = async () => {
    if (!isLoggedIn) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/invite/${token}`);
      return;
    }

    setJoining(true);
    try {
      const result = await api.workspaces.joinByInvite(token);
      setJoined(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🥑</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            {error === "Already a member" ? "You're already in!" : "Invite not found"}
          </h2>
          <p className="text-gray-500 mb-4">
            {error === "Already a member"
              ? "You're already a member of this workspace."
              : "This invite link is invalid or has expired."}
          </p>
          <button onClick={() => router.push("/dashboard")}
            className="px-6 py-2.5 bg-green-primary text-white rounded-xl font-medium hover:bg-green-primary/90 transition-colors">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">🥑</div>
        {joined ? (
          <>
            <h2 className="text-xl font-semibold text-green-primary mb-2">You're in!</h2>
            <p className="text-gray-500">Welcome to <span className="font-medium text-gray-800">{info.workspaceName}</span>. Redirecting...</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">You've been invited to</h2>
            <p className="text-2xl font-bold text-green-primary mb-2">{info.workspaceName}</p>
            <p className="text-gray-400 text-sm mb-6">
              {info.memberCount} member{info.memberCount !== 1 ? "s" : ""} already here
            </p>
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full py-3 bg-green-primary text-white rounded-xl font-medium hover:bg-green-primary/90 transition-colors disabled:opacity-50"
            >
              {joining ? "Joining..." : isLoggedIn ? "Join Workspace" : "Sign in to Join"}
            </button>
            {!isLoggedIn && (
              <p className="text-xs text-gray-400 mt-3">
                Don't have an account? <a href={`/join?redirect=/invite/${token}`} className="text-green-primary font-medium">Sign up</a>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
