"use client";
import { useState } from "react";

type Props = {
  onAdd: (contact: { email?: string; phone?: string }) => Promise<void>;
  onClose: () => void;
};

export function AddMemberModal({ onAdd, onClose }: Props) {
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await onAdd(method === "email" ? { email: value } : { phone: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add member</h3>
        <div className="flex gap-2 mb-4">
          {(["email", "phone"] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${method === m ? "bg-green-primary text-white" : "bg-green-light text-green-primary"}`}>
              {m === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <input type={method === "email" ? "email" : "tel"} value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={method === "email" ? "member@example.com" : "+1 555 123 4567"}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30" required autoFocus />
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg text-sm text-gray-600 bg-gray-100">Cancel</button>
            <button type="submit" className="flex-1 py-2 rounded-lg text-sm text-white bg-green-primary font-medium">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
