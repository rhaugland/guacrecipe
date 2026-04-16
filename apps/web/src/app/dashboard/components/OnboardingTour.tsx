"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { open: boolean; onClose: () => void };

const TOUR_KEY = "nsTourCompleted";

function DotPagination({ current }: { current: number }) {
  return (
    <div className="flex justify-center gap-1.5 mb-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === current ? "bg-green-primary w-4" : "bg-gray-200 w-1.5"
          }`}
        />
      ))}
    </div>
  );
}

function SkipLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-3 right-4 text-xs text-gray-400 hover:text-gray-600 transition"
    >
      Skip tour
    </button>
  );
}

export function OnboardingTour({ open, onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  if (!open) return null;

  const finish = () => {
    if (typeof window !== "undefined") localStorage.setItem(TOUR_KEY, "1");
    onClose();
  };

  const goToCalendar = () => {
    if (typeof window !== "undefined") localStorage.setItem(TOUR_KEY, "1");
    onClose();
    router.push("/dashboard/settings");
  };

  const weatherLegend: { e: string; l: string }[] = [
    { e: "\u2600\uFE0F", l: "Sunny" },
    { e: "\u26C5", l: "Partly cloudy" },
    { e: "\u2601\uFE0F", l: "Cloudy" },
    { e: "\uD83C\uDF27\uFE0F", l: "Rainy" },
    { e: "\u26C8\uFE0F", l: "Storm" },
  ];

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-6 relative">
        {step === 0 && (
          <>
            <DotPagination current={0} />
            <SkipLink onClick={finish} />
            <div className="flex justify-center gap-2 mt-2 mb-1">
              {weatherLegend.map((w) => (
                <div key={w.l} className="text-center">
                  <div className="text-2xl">{w.e}</div>
                  <div className="text-[9px] text-gray-400 mt-1">{w.l}</div>
                </div>
              ))}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 text-center mt-4">
              Your day, as weather
            </h3>
            <p className="text-sm text-gray-600 text-center mt-2 leading-relaxed">
              Each teammate&apos;s day shows as weather based on how busy they are.
              Sunny means open, storm means slammed.
            </p>
            <button
              onClick={() => setStep(1)}
              className="mt-5 w-full py-3 rounded-full bg-green-primary text-white text-sm font-medium hover:opacity-90 transition"
            >
              Next
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <DotPagination current={1} />
            <SkipLink onClick={finish} />
            <div className="flex justify-center mt-2">
              <span className="text-6xl">{"\uD83D\uDCC5"}</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 text-center mt-4">
              Connect your calendar
            </h3>
            <p className="text-sm text-gray-600 text-center mt-2 leading-relaxed">
              We&apos;ll auto-update your forecast from your meetings — or you can
              set it manually any time.
            </p>
            <button
              onClick={goToCalendar}
              className="mt-5 w-full py-3 rounded-full bg-green-primary text-white text-sm font-medium hover:opacity-90 transition"
            >
              Connect Google Calendar
            </button>
            <button
              onClick={() => setStep(2)}
              className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600 py-2 transition"
            >
              Skip — I&apos;ll set it manually
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <DotPagination current={2} />
            <SkipLink onClick={finish} />
            <div className="mt-2 mx-auto max-w-[260px]">
              <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2">
                <span className="text-base">{"\u26C8\uFE0F"}</span>
                <p className="text-xs text-amber-800 flex-1 text-left">
                  Marcus is slammed — 9 meetings today. Only message if urgent.
                </p>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 text-center mt-4">
              Storm-aware messaging
            </h3>
            <p className="text-sm text-gray-600 text-center mt-2 leading-relaxed">
              When a teammate is rainy or stormed, we&apos;ll warn you before
              sending. You can also queue messages to deliver when they&apos;re
              sunny again.
            </p>
            <button
              onClick={finish}
              className="mt-5 w-full py-3 rounded-full bg-green-primary text-white text-sm font-medium hover:opacity-90 transition"
            >
              Got it — let&apos;s go
            </button>
          </>
        )}
      </div>
    </div>
  );
}
