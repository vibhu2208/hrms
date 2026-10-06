'use client';

import { TaskBoard } from '@/components/task-board';

export default function MyTasks() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Tasks</h1>
      <TaskBoard tasksQuery="/tasks?mine=true" returnTo="/employee/tasks" enableActions />
    </div>
  );
}
