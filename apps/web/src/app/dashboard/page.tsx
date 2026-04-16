"use client";
import { useAuth } from "../../hooks/useAuth";

export default function WeatherPage() {
  const { user } = useAuth();

  if (!user) {
    return <div className="text-green-primary text-lg text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 text-center">
        <div className="text-7xl md:text-8xl mb-4">☀️</div>
        <h2 className="text-2xl md:text-3xl font-bold text-green-primary mb-2">Sunny skies ahead</h2>
        <p className="text-gray-500 mb-8">Your day at a glance</p>

        <div className="bg-gradient-to-br from-pink-50 to-blue-50 rounded-xl p-6 border border-pink-100">
          <p className="text-sm text-gray-600 mb-1">Connect your calendar</p>
          <p className="text-xs text-gray-400">
            Calendar integration coming soon. Once connected, your weather will reflect how busy your day looks.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-6 text-xs text-gray-400">
          <div><div className="text-2xl mb-1">☀️</div>Light day</div>
          <div><div className="text-2xl mb-1">⛅</div>Partly cloudy</div>
          <div><div className="text-2xl mb-1">🌧️</div>Rainy</div>
          <div><div className="text-2xl mb-1">⛈️</div>Storm</div>
        </div>
      </div>
    </div>
  );
}
