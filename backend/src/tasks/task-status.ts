import { TaskStatus } from '@prisma/client';

/**
 * Allowed status transitions, expressed as data rather than branching logic.
 *
 *   TODO → IN_PROGRESS → IN_REVIEW → DONE
 *                     ↘ BLOCKED (from any active state, and back again)
 *
 * Keeping the rules in one adjacency map makes them the single source of truth,
 * trivial to unit-test, and an O(1) membership check. DONE is terminal;
 * IN_REVIEW can fall back to IN_PROGRESS (review rejected).
 */
export const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW, TaskStatus.BLOCKED],
  [TaskStatus.IN_REVIEW]: [
    TaskStatus.DONE,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
  ],
  [TaskStatus.BLOCKED]: [
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.IN_REVIEW,
  ],
  [TaskStatus.DONE]: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}
