'use client';

import { TaskBoard } from '@/components/task-board';

export default function AdminTasksPage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Tasks</h1>
      <TaskBoard tasksQuery="/tasks" returnTo="/admin/tasks" />
    </div>
  );
}
