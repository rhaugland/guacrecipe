"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api-client";
import { setSessionToken } from "../../lib/api-client";

const CHANNELS = [
  { icon: "📧", name: "Email", desc: "Get messages in your inbox" },
  { icon: "💬", name: "SMS", desc: "Text messages to your phone" },
  { icon: "🎮", name: "Discord", desc: "DMs from the Guac bot" },
  { icon: "💼", name: "Slack", desc: "Messages in Slack" },
];

export default function JoinPage() {
  return (
    <Suspense>
      <JoinPageInner />
    </Suspense>
  );
}

function JoinPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const result = await api.auth.requestMagicLink({ email }) as {
        success: boolean;
        token?: string;
        redirect?: string;
      };
      if (result.token) {
        setSessionToken(result.token);
        router.push(result.redirect ?? "/dashboard");
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🥑</div>
          <h2 className="text-xl font-semibold text-green-primary mb-2">Check your email!</h2>
          <p className="text-gray-600">We sent you a magic link. Click it to set up your preferences.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-8 max-w-lg">
        <div className="text-6xl mb-4">🥑</div>
        <h1 className="text-3xl md:text-4xl font-bold text-green-primary mb-3">
          Someone sent you a message via Guac
        </h1>
        <p className="text-gray-600 text-lg">
          Guac lets you control <span className="font-medium text-gray-800">how</span> people reach you.
          Set your preferred channel once — everyone who messages you through Guac will use it automatically.
        </p>
      </div>

      {/* Channel showcase */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-lg w-full mb-8">
        {CHANNELS.map((ch) => (
          <div key={ch.name} className="bg-white rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl mb-1">{ch.icon}</div>
            <p className="text-sm font-medium text-gray-800">{ch.name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{ch.desc}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl shadow-sm p-6 max-w-lg w-full mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 text-center">How it works</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-green-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
            <div>
              <p className="text-sm font-medium text-gray-800">Sign up in 30 seconds</p>
              <p className="text-xs text-gray-400">Just your email — no password needed</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-green-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
            <div>
              <p className="text-sm font-medium text-gray-800">Pick your preferred channel</p>
              <p className="text-xs text-gray-400">Email, SMS, Discord, Slack — your choice</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-green-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
            <div>
              <p className="text-sm font-medium text-gray-800">Messages find you automatically</p>
              <p className="text-xs text-gray-400">Anyone using Guac delivers to your preferred channel</p>
            </div>
          </div>
        </div>
      </div>

      {/* Signup form */}
      <div className="bg-white rounded-2xl shadow-sm p-6 max-w-lg w-full">
        <form onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Get started</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30 focus:border-green-primary text-sm"
            required
          />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button
            type="submit"
            className="w-full mt-3 py-3 bg-green-primary text-white rounded-xl font-medium hover:bg-green-primary/90 transition-colors"
          >
            Join Guac — it&apos;s free
          </button>
        </form>
        <p className="text-xs text-gray-400 text-center mt-3">
          No passwords, no apps to install. Just click the magic link we send you.
        </p>
      </div>

      {ref && <input type="hidden" name="ref" value={ref} />}
    </div>
  );
}
