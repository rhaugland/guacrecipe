"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api-client";
import { useAuth } from "../../hooks/useAuth";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Asia/Tokyo",
];

const DAYS = [
  { value: 0, label: "S" }, { value: 1, label: "M" },
  { value: 2, label: "T" }, { value: 3, label: "W" },
  { value: 4, label: "T" }, { value: 5, label: "F" },
  { value: 6, label: "S" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "Text" },
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
];

const TIMING_OPTIONS = [
  { value: "2_weeks", label: "2 weeks" },
  { value: "1_week", label: "1 week" },
  { value: "3_days", label: "3 days" },
  { value: "2_days", label: "2 days" },
  { value: "day_of", label: "Day of" },
];

// -- Step 1: Welcome --
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-6xl mb-6">🥑</div>
      <h1 className="text-3xl font-bold text-green-primary mb-3">Welcome to Guac</h1>
      <p className="text-gray-500 text-lg mb-2">Your communication switchboard.</p>
      <p className="text-gray-400 text-sm max-w-sm mx-auto mb-8">
        One place to route messages across all your channels — email, text, Slack, Discord, and more.
      </p>
      <button
        onClick={onNext}
        className="px-8 py-3 bg-green-primary text-white rounded-xl text-lg font-medium hover:bg-green-primary/90 transition-colors"
      >
        Begin
      </button>
    </div>
  );
}

// -- Step 2: How it works diagram --
function HowItWorksStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center py-8 px-6">
      <h2 className="text-xl font-bold text-gray-900 mb-2">How Guac works</h2>
      <p className="text-gray-400 text-sm mb-8">From you to them, through any channel</p>

      {/* Diagram */}
      <div className="flex items-center justify-center gap-0 mb-8 px-2">
        {/* You */}
        <div className="flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-green-primary/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-green-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
          </div>
          <span className="text-xs font-medium text-gray-500 mt-1.5">You</span>
        </div>

        {/* Line */}
        <div className="w-8 md:w-12 h-px bg-green-primary/30 mx-1" />

        {/* Guac */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-green-primary/10 flex items-center justify-center">
            <span className="text-3xl">🥑</span>
          </div>
          <span className="text-xs font-bold text-green-primary mt-1.5">Guac</span>
        </div>

        {/* Line */}
        <div className="w-8 md:w-12 h-px bg-green-primary/30 mx-1" />

        {/* Them */}
        <div className="flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-green-primary/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-green-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197" />
            </svg>
          </div>
          <span className="text-xs font-medium text-gray-500 mt-1.5">Them</span>
        </div>
      </div>

      {/* Channel fan-out from "Them" */}
      <div className="flex justify-center gap-3 md:gap-4 mb-8">
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <span className="text-[10px] text-gray-400">Email</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-[10px] text-gray-400">SMS</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
          </div>
          <span className="text-[10px] text-gray-400">Discord</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A" />
              <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0" />
              <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D" />
              <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E" />
            </svg>
          </div>
          <span className="text-[10px] text-gray-400">Slack</span>
        </div>
      </div>

      <p className="text-sm text-gray-400 max-w-xs mx-auto mb-8">
        You send a message through Guac, and we deliver it to them on whichever channel they prefer.
      </p>

      <button
        onClick={onNext}
        className="px-8 py-3 bg-green-primary text-white rounded-xl text-lg font-medium hover:bg-green-primary/90 transition-colors"
      >
        Let's get you set up
      </button>
    </div>
  );
}

// -- Step 3: Preferences --
function PreferencesStep({ user, onComplete }: { user: any; onComplete: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notificationChannels, setNotificationChannels] = useState<string[]>(["email"]);
  const [timings, setTimings] = useState<string[]>(["1_week", "day_of"]);
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(true);
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("17:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.email) setEmail(user.email);
      if (user.phone) setPhone(user.phone);
    }
  }, [user]);

  const toggleChannel = (ch: string) => {
    setNotificationChannels((prev) => {
      const updated = prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch];
      return updated.length === 0 ? prev : updated;
    });
  };

  const toggleTiming = (t: string) => {
    setTimings((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const toggleDay = (d: number) => {
    setWorkingDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setError("");
    setSaving(true);
    try {
      await api.onboarding.complete({
        name: name.trim(),
        email,
        phone,
        preferredChannel: notificationChannels[0] ?? "email",
        notificationChannels,
        notificationTimings: timings,
        workingHoursEnabled,
        workingHoursStart,
        workingHoursEnd,
        workingHoursTimezone: timezone,
        workingHoursDays: workingDays,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <div className="py-6 px-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Set your preferences</h2>
        <p className="text-gray-400 text-sm mt-1">You can change these anytime from your dashboard</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="How should people see you?"
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" required />
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-primary/30" />
          </div>
        </div>

        {/* Notification channels */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">How should people reach you?</label>
          <div className="space-y-2">
            {CHANNEL_OPTIONS.map((ch) => (
              <label key={ch.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationChannels.includes(ch.value)}
                  onChange={() => toggleChannel(ch.value)}
                  className="w-4 h-4 rounded border-gray-300 text-green-primary focus:ring-green-primary/30"
                />
                <span className="text-sm text-gray-700">{ch.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">You'll be notified on all checked channels. At least one required.</p>
        </div>

        {/* Task reminders */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Task reminders</label>
          <div className="flex flex-wrap gap-2">
            {TIMING_OPTIONS.map((t) => (
              <button key={t.value} type="button" onClick={() => toggleTiming(t.value)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  timings.includes(t.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Working hours */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Working hours</label>
            <button type="button" onClick={() => setWorkingHoursEnabled(!workingHoursEnabled)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                workingHoursEnabled ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
              }`}>
              {workingHoursEnabled ? "On" : "Off"}
            </button>
          </div>
          {workingHoursEnabled && (
            <>
              <p className="text-xs text-gray-400 mb-2">You won't get notifications outside these hours</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
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
                className="w-full px-3 py-2 rounded-lg border border-gray-200 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30">
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
              </select>
              <div className="flex gap-1">
                {DAYS.map((d) => (
                  <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                    className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                      workingDays.includes(d.value) ? "bg-green-primary text-white" : "bg-gray-100 text-gray-500"
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={saving}
          className="w-full py-3 bg-green-primary text-white rounded-xl font-medium hover:bg-green-primary/90 transition-colors disabled:opacity-50">
          {saving ? "Saving..." : "Done"}
        </button>
      </form>
    </div>
  );
}

// -- Main --
export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(0);

  // Step indicators
  const steps = ["Welcome", "How it works", "Preferences"];

  return (
    <div className="min-h-screen bg-cream py-8 md:py-12 px-4 flex items-start justify-center">
      <div className="max-w-lg w-full">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-8 bg-green-primary" : i < step ? "w-4 bg-green-primary/40" : "w-4 bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
          {step === 1 && <HowItWorksStep onNext={() => setStep(2)} />}
          {step === 2 && (
            <PreferencesStep
              user={user}
              onComplete={() => router.push("/dashboard")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
