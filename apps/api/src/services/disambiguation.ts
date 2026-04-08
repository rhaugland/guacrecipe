import { db, disambiguationSessions } from "@guac/db";
import { eq, and } from "drizzle-orm";

type DisambiguationOption = { value: string; label: string };

export function formatDisambiguationMessage(
  step: "workspace" | "recipient",
  options: DisambiguationOption[],
): string {
  const header = step === "workspace"
    ? "Which workspace is this for?"
    : "Who should receive this?";

  const lines = options.map((opt, i) => `${i + 1}. ${opt.label}`);
  return `${header}\n${lines.join("\n")}\nReply with the number.`;
}

export function parseDisambiguationReply(
  reply: string,
  options: DisambiguationOption[],
): DisambiguationOption | null {
  const num = parseInt(reply.trim(), 10);
  if (isNaN(num) || num < 1 || num > options.length) return null;
  return options[num - 1];
}

export async function createDisambiguationSession(input: {
  senderId: string;
  originalMessage: string;
  step: "workspace" | "recipient";
  options: DisambiguationOption[];
  resolvedWorkspaceId?: string;
}) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  const [session] = await db.insert(disambiguationSessions).values({
    senderId: input.senderId,
    originalMessage: input.originalMessage,
    step: input.step,
    options: input.options,
    resolvedWorkspaceId: input.resolvedWorkspaceId ?? null,
    status: "pending",
    expiresAt,
  }).returning();

  return session;
}

export async function findPendingSession(senderId: string) {
  const [session] = await db.select()
    .from(disambiguationSessions)
    .where(
      and(
        eq(disambiguationSessions.senderId, senderId),
        eq(disambiguationSessions.status, "pending"),
      )
    );

  if (!session) return null;
  if (new Date() > session.expiresAt) {
    await db.update(disambiguationSessions)
      .set({ status: "expired" })
      .where(eq(disambiguationSessions.id, session.id));
    return null;
  }

  return session;
}

export async function resolveDisambiguationSession(
  sessionId: string,
  updates: {
    resolvedWorkspaceId?: string;
    resolvedRecipientId?: string;
    step?: "workspace" | "recipient";
    options?: DisambiguationOption[];
    status?: "pending" | "resolved" | "expired";
  },
) {
  const [updated] = await db.update(disambiguationSessions)
    .set(updates)
    .where(eq(disambiguationSessions.id, sessionId))
    .returning();
  return updated;
}
