"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api-client";
import { useAuth } from "../../hooks/useAuth";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Asia/Tokyo",
];

const DAYS = [
  { value: 0, label: "Sun" }, { value: 1, label: "Mon" },
  { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const TIMING_OPTIONS = [
  { value: "2_weeks", label: "2 weeks before" },
  { value: "1_week", label: "1 week before" },
  { value: "3_days", label: "3 days before" },
  { value: "2_days", label: "2 days before" },
  { value: "day_of", label: "Day of" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [preferredChannel, setPreferredChannel] = useState<"sms" | "email">("email");
  const [timings, setTimings] = useState<string[]>(["2_weeks", "1_week", "3_days", "2_days", "day_of"]);
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("17:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [error, setError] = useState("");

  const toggleTiming = (t: string) => {
    setTimings((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const toggleDay = (d: number) => {
    setWorkingDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.onboarding.complete({
        name, email, phone, preferredChannel,
        notificationTimings: timings,
        workingHoursStart, workingHoursEnd,
        workingHoursTimezone: timezone,
        workingHoursDays: workingDays,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen bg-cream py-12 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🥑</div>
          <h1 className="text-2xl font-bold text-green-primary">Welcome to Guac</h1>
          <p className="text-gray-500 mt-1">Let's set up your preferences</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Preferred communication</label>
            <div className="flex gap-2">
              {(["email", "sms"] as const).map((ch) => (
                <button key={ch} type="button" onClick={() => setPreferredChannel(ch)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    preferredChannel === ch ? "bg-green-primary text-white" : "bg-green-light text-green-primary"
                  }`}>
                  {ch === "sms" ? "Text" : "Email"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Task reminders</label>
            <div className="flex flex-wrap gap-2">
              {TIMING_OPTIONS.map((t) => (
                <button key={t.value} type="button" onClick={() => toggleTiming(t.value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    timings.includes(t.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-600"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Working hours</label>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="text-xs text-gray-500">Start</label>
                <input type="time" value={workingHoursStart} onChange={(e) => setWorkingHoursStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
              </div>
              <div>
                <label className="text-xs text-gray-500">End</label>
                <input type="time" value={workingHoursEnd} onChange={(e) => setWorkingHoursEnd(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
              </div>
            </div>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none focus:ring-2 focus:ring-green-primary/30">
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace("_", " ")}</option>)}
            </select>
            <div className="flex gap-1">
              {DAYS.map((d) => (
                <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    workingDays.includes(d.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-600"
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button type="submit"
            className="w-full py-3 bg-green-primary text-white rounded-lg font-medium hover:bg-green-primary/90 transition-colors">
            Get started
          </button>
        </form>
      </div>
    </div>
  );
}
