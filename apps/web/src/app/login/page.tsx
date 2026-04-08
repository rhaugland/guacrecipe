"use client";
import { useState } from "react";
import { api } from "../../lib/api-client";

export default function LoginPage() {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.auth.requestMagicLink(
        method === "email" ? { email: value } : { phone: value }
      );
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">🥑</div>
          <h2 className="text-xl font-semibold text-green-primary mb-2">Check your {method}!</h2>
          <p className="text-gray-600">We sent you a magic link. Click it to sign in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🥑</div>
          <h1 className="text-2xl font-bold text-green-primary">Guac</h1>
          <p className="text-gray-500 mt-1">Sign in with a magic link</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMethod("email")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === "email"
                ? "bg-green-primary text-white"
                : "bg-green-light text-green-primary"
            }`}
          >
            Email
          </button>
          <button
            onClick={() => setMethod("phone")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              method === "phone"
                ? "bg-green-primary text-white"
                : "bg-green-light text-green-primary"
            }`}
          >
            Phone
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type={method === "email" ? "email" : "tel"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={method === "email" ? "you@example.com" : "+1 555 123 4567"}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30 focus:border-green-primary"
            required
          />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button
            type="submit"
            className="w-full mt-4 py-3 bg-green-primary text-white rounded-lg font-medium hover:bg-green-primary/90 transition-colors"
          >
            Send magic link
          </button>
        </form>
      </div>
    </div>
  );
}
