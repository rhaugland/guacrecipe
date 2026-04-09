import { Hono } from "hono";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth";
import { db, workspaces, workspaceMembers, users, workspaceContactOverrides, workspaceInvites, sessions } from "@guac/db";
import { eq, and, gt } from "drizzle-orm";
import { createMagicLink } from "../services/magic-link";

const workspacesRouter = new Hono();

// List user's workspaces
workspacesRouter.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const memberships = await db.select({
    workspace: workspaces,
    role: workspaceMembers.role,
  })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  const result = await Promise.all(
    memberships.map(async (m) => {
      const members = await db.select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, m.workspace.id));
      return {
        ...m.workspace,
        role: m.role,
        memberCount: members.length,
      };
    })
  );

  return c.json({ workspaces: result });
});

// Create workspace
workspacesRouter.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { name } = await c.req.json();

  if (!name || name.trim().length === 0) {
    return c.json({ error: "Workspace name is required" }, 400);
  }

  const [workspace] = await db.insert(workspaces).values({
    name: name.trim(),
    createdBy: userId,
  }).returning();

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "admin",
  });

  return c.json({ workspace }, 201);
});

// List members
workspacesRouter.get("/:id/members", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");

  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const members = await db.select({
    user: users,
    role: workspaceMembers.role,
    addedAt: workspaceMembers.addedAt,
  })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  const overrides = await db.select().from(workspaceContactOverrides)
    .where(eq(workspaceContactOverrides.workspaceId, workspaceId));

  const overrideMap = new Map(overrides.map((o) => [o.userId, o]));

  return c.json({
    members: members.map((m) => {
      const override = overrideMap.get(m.user.id);
      return {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        phone: m.user.phone,
        role: m.role,
        preferredChannel: m.user.preferredChannel,
        notificationChannels: m.user.notificationChannels ?? [m.user.preferredChannel ?? "email"],
        workingHoursEnabled: m.user.workingHoursEnabled,
        notificationsEnabled: m.user.notificationsEnabled,
        addedAt: m.addedAt,
        workspaceEmail: override?.email ?? null,
        workspacePhone: override?.phone ?? null,
      };
    }),
  });
});

// Add member (admin only)
workspacesRouter.post("/:id/members", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");
  const { email, phone } = await c.req.json();

  if (!email && !phone) return c.json({ error: "Email or phone required" }, 400);

  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership || membership.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  let targetUser;
  if (email) {
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    targetUser = existing;
  } else if (phone) {
    const [existing] = await db.select().from(users).where(eq(users.phone, phone));
    targetUser = existing;
  }

  if (targetUser) {
    const [existingMember] = await db.select().from(workspaceMembers).where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUser.id))
    );
    if (existingMember) return c.json({ error: "Already a member" }, 409);

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: targetUser.id,
      role: "member",
    });
  } else {
    const [newUser] = await db.insert(users).values({
      email: email ?? null,
      phone: phone ?? null,
    }).returning();

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: newUser.id,
      role: "member",
    });

    await createMagicLink({
      email,
      phone,
      userId: newUser.id,
      workspaceId,
    });
  }

  return c.json({ success: true }, 201);
});

// Remove member (admin only)
workspacesRouter.delete("/:id/members/:userId", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const callerUserId = c.get("userId");
  const targetUserId = c.req.param("userId");

  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, callerUserId))
  );
  if (!membership || membership.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  if (callerUserId === targetUserId) {
    return c.json({ error: "Cannot remove yourself" }, 400);
  }

  await db.delete(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId))
  );

  return c.json({ success: true });
});

// Get my contact override for a workspace
workspacesRouter.get("/:id/contact", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");

  const [override] = await db.select().from(workspaceContactOverrides).where(
    and(eq(workspaceContactOverrides.workspaceId, workspaceId), eq(workspaceContactOverrides.userId, userId))
  );

  return c.json({ contact: override ?? null });
});

// Set my contact override for a workspace
workspacesRouter.put("/:id/contact", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");
  const { email, phone } = await c.req.json();

  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership) return c.json({ error: "Not a member" }, 403);

  const [existing] = await db.select().from(workspaceContactOverrides).where(
    and(eq(workspaceContactOverrides.workspaceId, workspaceId), eq(workspaceContactOverrides.userId, userId))
  );

  if (existing) {
    const [updated] = await db.update(workspaceContactOverrides).set({
      email: email ?? null,
      phone: phone ?? null,
    }).where(eq(workspaceContactOverrides.id, existing.id)).returning();
    return c.json({ contact: updated });
  } else {
    const [created] = await db.insert(workspaceContactOverrides).values({
      workspaceId,
      userId,
      email: email ?? null,
      phone: phone ?? null,
    }).returning();
    return c.json({ contact: created });
  }
});

// Generate or get existing invite link for a workspace (admin only)
workspacesRouter.post("/:id/invite", requireAuth, async (c) => {
  const workspaceId = c.req.param("id");
  const userId = c.get("userId");

  const [membership] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (!membership || membership.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Check for existing valid invite
  const [existing] = await db.select().from(workspaceInvites).where(
    and(eq(workspaceInvites.workspaceId, workspaceId))
  );

  if (existing) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3002";
    return c.json({ url: `${appUrl}/invite/${existing.token}`, token: existing.token });
  }

  // Create new invite
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(workspaceInvites).values({
    workspaceId,
    token,
    createdBy: userId,
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3002";
  return c.json({ url: `${appUrl}/invite/${token}`, token });
});

// Accept an invite (authenticated user joins workspace)
workspacesRouter.post("/join/:token", requireAuth, async (c) => {
  const token = c.req.param("token");
  const userId = c.get("userId");

  const [invite] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.token, token));
  if (!invite) return c.json({ error: "Invalid invite link" }, 404);

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return c.json({ error: "Invite link has expired" }, 410);
  }

  // Check if already a member
  const [existingMember] = await db.select().from(workspaceMembers).where(
    and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, userId))
  );
  if (existingMember) return c.json({ error: "Already a member", workspaceId: invite.workspaceId }, 409);

  await db.insert(workspaceMembers).values({
    workspaceId: invite.workspaceId,
    userId,
    role: "member",
  });

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, invite.workspaceId));
  return c.json({ success: true, workspace: { id: workspace.id, name: workspace.name } });
});

// Get invite info (public — no auth required)
workspacesRouter.get("/invite-info/:token", async (c) => {
  const token = c.req.param("token");

  const [invite] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.token, token));
  if (!invite) return c.json({ error: "Invalid invite" }, 404);

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return c.json({ error: "Invite expired" }, 410);
  }

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, invite.workspaceId));
  const memberCount = await db.select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, invite.workspaceId));

  return c.json({
    workspaceName: workspace.name,
    memberCount: memberCount.length,
  });
});

export default workspacesRouter;
