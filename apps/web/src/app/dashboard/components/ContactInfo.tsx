"use client";
import { useState } from "react";
import type { Preferences } from "../../../lib/types";
import { CollapsibleCard } from "./CollapsibleCard";

const DISCORD_BOT_INVITE = "https://discord.com/oauth2/authorize?client_id=1491606274956202094&permissions=2048&scope=bot";

type Props = {
  prefs: Preferences;
  onUpdate: (data: Partial<Preferences>) => void;
};

export function ContactInfo({ prefs, onUpdate }: Props) {
  const [discordId, setDiscordId] = useState(prefs.discordId ?? "");
  const [editingDiscord, setEditingDiscord] = useState(false);
  const [showDiscordHelp, setShowDiscordHelp] = useState(false);
  const hasDiscord = !!prefs.discordId;

  const [showSlackHelp, setShowSlackHelp] = useState(false);
  const hasSlack = !!prefs.slackId;

  const [telegramId, setTelegramId] = useState(prefs.telegramChatId ?? "");
  const [editingTelegram, setEditingTelegram] = useState(false);
  const [showTelegramHelp, setShowTelegramHelp] = useState(false);
  const hasTelegram = !!prefs.telegramChatId;

  const handleSaveTelegram = () => {
    onUpdate({ telegramChatId: telegramId || null } as any);
    setEditingTelegram(false);
  };

  const handleSaveDiscord = () => {
    onUpdate({ discordId: discordId || null });
    setEditingDiscord(false);
  };

  return (
    <CollapsibleCard title="Send a message through Guac">
      <p className="text-sm text-gray-500 mb-4">Message Guac from any channel below to route to your workspace members.</p>

      {/* SMS */}
      <div className="flex items-center justify-between py-2.5">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-green-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="text-sm text-gray-700">Text</span>
        </div>
        <a href="sms:+16513720165" className="text-sm font-medium text-green-primary hover:underline">(651) 372-0165</a>
      </div>

      {/* Email */}
      <div className="flex items-center justify-between py-2.5 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-green-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
          <span className="text-sm text-gray-700">Email</span>
        </div>
        <a href="mailto:avo@guacwithme.com" className="text-sm font-medium text-green-primary hover:underline">avo@guacwithme.com</a>
      </div>

      {/* Discord */}
      <div className="flex items-center justify-between py-2.5 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
          </svg>
          <span className="text-sm text-gray-700">Discord</span>
          <button
            onClick={() => setShowDiscordHelp(!showDiscordHelp)}
            className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold hover:bg-gray-300 transition-colors flex items-center justify-center"
            title="How to find your Discord User ID"
          >
            i
          </button>
        </div>

        {hasDiscord && !editingDiscord ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-primary font-medium">Connected</span>
            <button onClick={() => setEditingDiscord(true)} className="text-xs text-gray-400 hover:text-gray-600">Edit</button>
          </div>
        ) : editingDiscord ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={discordId}
              onChange={(e) => setDiscordId(e.target.value)}
              placeholder="Your User ID"
              className="w-44 px-2 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30"
              autoFocus
            />
            <button onClick={handleSaveDiscord} className="px-3 py-1 bg-green-primary text-white rounded-lg text-xs font-medium">Save</button>
            <button onClick={() => { setEditingDiscord(false); setDiscordId(prefs.discordId ?? ""); }} className="text-xs text-gray-400">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <a
              href={DISCORD_BOT_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-[#5865F2] text-white rounded-lg text-xs font-medium hover:bg-[#4752C4] transition-colors"
            >
              Add Guac Bot
            </a>
            <button onClick={() => setEditingDiscord(true)} className="px-3 py-1.5 bg-green-light text-green-primary rounded-lg text-xs font-medium">
              Enter User ID
            </button>
          </div>
        )}
      </div>

      {showDiscordHelp && (
        <div className="bg-gray-50 rounded-lg p-3 mt-2 mb-1 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">How to find your Discord User ID:</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Open Discord Settings (gear icon, bottom left)</li>
            <li>Go to Advanced and turn on Developer Mode</li>
            <li>Close settings</li>
            <li>Click your profile picture or name</li>
            <li>Click "Copy User ID"</li>
          </ol>
        </div>
      )}

      {/* Slack */}
      <div className="flex items-center justify-between py-2.5 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
            <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
            <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
            <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E"/>
          </svg>
          <span className="text-sm text-gray-700">Slack</span>
          <button
            onClick={() => setShowSlackHelp(!showSlackHelp)}
            className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold hover:bg-gray-300 transition-colors flex items-center justify-center"
            title="How Slack connection works"
          >
            i
          </button>
        </div>

        {hasSlack ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-primary font-medium">Connected</span>
            <a
              href="/api/slack/install"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Reconnect
            </a>
          </div>
        ) : (
          <a
            href="/api/slack/install"
            className="px-3 py-1.5 bg-[#4A154B] text-white rounded-lg text-xs font-medium hover:bg-[#3b1139] transition-colors"
          >
            Add to Slack
          </a>
        )}
      </div>

      {showSlackHelp && (
        <div className="bg-gray-50 rounded-lg p-3 mt-2 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">How Slack connection works:</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Click "Add to Slack" and authorize the bot</li>
            <li>Your Slack account is linked automatically</li>
            <li>DM <span className="font-semibold text-gray-700">@guac</span> in Slack to send messages</li>
            <li>Set your preferred channel to "Slack" to receive via DM</li>
          </ol>
        </div>
      )}

      {/* Telegram */}
      <div className="flex items-center justify-between py-2.5 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-[#26A5E4]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          <span className="text-sm text-gray-700">Telegram</span>
          <button
            onClick={() => setShowTelegramHelp(!showTelegramHelp)}
            className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold hover:bg-gray-300 transition-colors flex items-center justify-center"
            title="How to connect Telegram"
          >
            i
          </button>
        </div>

        {hasTelegram && !editingTelegram ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-primary font-medium">Connected</span>
            <button onClick={() => setEditingTelegram(true)} className="text-xs text-gray-400 hover:text-gray-600">Edit</button>
          </div>
        ) : editingTelegram ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              placeholder="Your Chat ID"
              className="w-44 px-2 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-primary/30"
              autoFocus
            />
            <button onClick={handleSaveTelegram} className="px-3 py-1 bg-green-primary text-white rounded-lg text-xs font-medium">Save</button>
            <button onClick={() => { setEditingTelegram(false); setTelegramId(prefs.telegramChatId ?? ""); }} className="text-xs text-gray-400">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setEditingTelegram(true)} className="px-3 py-1.5 bg-[#26A5E4] text-white rounded-lg text-xs font-medium hover:bg-[#1e8fc7] transition-colors">
            Connect
          </button>
        )}
      </div>

      {showTelegramHelp && (
        <div className="bg-gray-50 rounded-lg p-3 mt-2 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">How to connect Telegram:</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Open Telegram and search for <span className="font-semibold text-gray-700">@Team_Guac_Bot</span></li>
            <li>Send /start — the bot will reply with your Chat ID</li>
            <li>Paste that Chat ID here</li>
            <li>DM <span className="font-semibold text-gray-700">@Team_Guac_Bot</span> to send messages through Guac</li>
          </ol>
        </div>
      )}
    </CollapsibleCard>
  );
}
