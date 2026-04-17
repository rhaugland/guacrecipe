"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { api } from "../../../lib/api-client";
import type { WorkspaceMember } from "../../../lib/types";

type Task = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: "open" | "done";
  createdBy: string;
  assigneeId: string;
  createdAt: string;
  completedAt: string | null;
  creatorName: string | null;
  assigneeName: string | null;
};

type Role = "assignee" | "creator";

export default function TasksPage() {
  const { user } = useAuth();

  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [role, setRole] = useState<Role>("assignee");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  // Load workspace on mount
  useEffect(() => {
    if (!user) return;
    api.workspaces.list()
      .then((data) => {
        const ws = data.workspaces[0];
        if (ws) {
          setWorkspaceId(ws.id);
          return api.workspaces.members(ws.id);
        }
        return null;
      })
      .then((data) => {
        if (data) setMembers(data.members);
      })
      .catch((err) => console.error("[tasks] workspace load failed", err));
  }, [user]);

  const fetchTasks = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [openData, doneData] = await Promise.all([
        api.tasks.list(workspaceId, role, "open"),
        api.tasks.list(workspaceId, role, "done"),
      ]);
      setOpenTasks((openData.tasks as unknown as Task[]) ?? []);
      setDoneTasks((doneData.tasks as unknown as Task[]) ?? []);
    } catch (err) {
      console.error("[tasks] fetch failed", err);
      setOpenTasks([]);
      setDoneTasks([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, role]);

  useEffect(() => {
    if (workspaceId) {
      setLoading(true);
      fetchTasks();
    }
  }, [workspaceId, role, fetchTasks]);

  const handleCreate = async () => {
    if (!workspaceId || !newTitle.trim() || !newAssigneeId || !newDueDate) return;
    setCreating(true);
    try {
      await api.tasks.create({
        workspaceId,
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        assigneeId: newAssigneeId,
        dueDate: newDueDate,
      });
      setShowCreateForm(false);
      setNewTitle("");
      setNewDescription("");
      setNewAssigneeId("");
      setNewDueDate("");
      await fetchTasks();
    } catch (err) {
      console.error("[tasks] create error", err);
    } finally {
      setCreating(false);
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      await api.tasks.update(taskId, { status: "done" });
      await fetchTasks();
    } catch (err) {
      console.error("[tasks] complete error", err);
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await api.tasks.delete(taskId);
      setExpandedTaskId(null);
      await fetchTasks();
    } catch (err) {
      console.error("[tasks] delete error", err);
    }
  };

  if (!user) {
    return <div className="text-green-primary text-lg text-center py-8">Loading...</div>;
  }

  const userId = user.id;

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 bg-[#F2F2F7] flex items-center justify-between">
        <div className="flex gap-1 bg-gray-200 rounded-lg p-0.5">
          <button
            onClick={() => setRole("assignee")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              role === "assignee" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            Assigned to me
          </button>
          <button
            onClick={() => setRole("creator")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              role === "creator" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            Assigned by me
          </button>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-8 h-8 bg-green-primary text-white rounded-full flex items-center justify-center active:scale-95 transition-transform"
          aria-label="New task"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex items-center justify-center pt-16">
            <p className="text-gray-400 text-sm">Loading tasks…</p>
          </div>
        ) : (
          <>
            {openTasks.length > 0 ? (
              <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm overflow-hidden">
                {openTasks.map((task) => {
                  const isExpanded = expandedTaskId === task.id;
                  const dueDateObj = new Date(task.dueDate + "T00:00:00Z");
                  const now = new Date();
                  const diffMs = dueDateObj.getTime() - now.getTime();
                  const diffDays = Math.ceil(diffMs / 86400000);
                  const dueColor =
                    diffDays < 0 ? "bg-red-50 text-red-600" :
                    diffDays <= 1 ? "bg-amber-50 text-amber-700" :
                    "bg-gray-100 text-gray-600";
                  const dueLabel =
                    diffDays < 0 ? "Overdue" :
                    diffDays === 0 ? "Today" :
                    diffDays === 1 ? "Tomorrow" :
                    dueDateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });

                  return (
                    <div key={task.id} className="border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Checkbox */}
                        <button
                          onClick={() => handleComplete(task.id)}
                          className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 hover:border-green-primary transition-colors"
                          aria-label={`Mark "${task.title}" as done`}
                        />
                        {/* Main content — tap to expand */}
                        <button
                          onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-[15px] font-semibold text-gray-900 truncate">{task.title}</p>
                          <p className="text-sm text-gray-500 truncate">
                            {role === "assignee"
                              ? `From ${task.creatorName ?? "Unknown"}`
                              : `To ${task.assigneeName ?? "Unknown"}`}
                          </p>
                        </button>
                        {/* Due date pill */}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${dueColor}`}>
                          {dueLabel}
                        </span>
                      </div>
                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 pb-3 border-t border-gray-50">
                          {task.description && (
                            <p className="text-sm text-gray-600 mt-2">{task.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            Created{" "}
                            {new Date(task.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          {task.createdBy === userId && (
                            <button
                              onClick={() => handleDelete(task.id)}
                              className="mt-2 text-xs text-red-500 hover:text-red-700"
                            >
                              Delete task
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center pt-16">
                <p className="text-gray-400 text-sm">
                  {role === "assignee" ? "No open tasks assigned to you" : "No tasks assigned by you"}
                </p>
              </div>
            )}

            {/* Completed accordion */}
            {doneTasks.length > 0 && (
              <div className="mx-4 mt-4 mb-4">
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="text-sm text-gray-500 font-medium flex items-center gap-1"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Completed ({doneTasks.length})
                </button>
                {showCompleted && (
                  <div className="mt-2 bg-white rounded-2xl shadow-sm overflow-hidden">
                    {doneTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="w-6 h-6 rounded-full bg-green-primary flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-[15px] text-gray-400 line-through truncate flex-1">{task.title}</p>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {task.completedAt
                            ? new Date(task.completedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* New task form — full-screen on mobile, modal on desktop */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 bg-white md:bg-black/30 md:flex md:items-center md:justify-center">
          <div className="w-full h-full md:w-[480px] md:h-auto md:max-h-[90vh] md:rounded-2xl bg-white md:shadow-xl flex flex-col">
            {/* Header */}
            <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-gray-100">
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewTitle("");
                  setNewDescription("");
                  setNewAssigneeId("");
                  setNewDueDate("");
                }}
                className="justify-self-start text-[15px] text-gray-500 active:opacity-60"
              >
                Cancel
              </button>
              <h3 className="justify-self-center text-[17px] font-semibold text-gray-900">New Task</h3>
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim() || !newAssigneeId || !newDueDate}
                className="justify-self-end text-[15px] font-semibold text-green-primary disabled:text-gray-300 active:opacity-60"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
            {/* Form fields */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Add details…"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
                <select
                  value={newAssigneeId}
                  onChange={(e) => setNewAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30"
                >
                  <option value="">Select a team member</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.email ?? "Unknown"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-green-primary/30"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
