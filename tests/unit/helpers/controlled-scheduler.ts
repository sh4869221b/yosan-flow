import type { Scheduler } from "effect";

export class ControlledScheduler implements Scheduler.Scheduler {
  readonly executionMode = "async";
  private tasks: Array<{ task: () => void; priority: number }> = [];
  shouldYield(): boolean {
    return false;
  }

  makeDispatcher(): Scheduler.SchedulerDispatcher {
    return {
      scheduleTask: (task, priority) => {
        this.tasks.push({ task, priority });
      },
      flush: () => {
        while (this.tasks.length > 0) this.step();
      },
    };
  }

  step(): void {
    const tasks = this.tasks;
    this.tasks = [];
    tasks.sort((left, right) => left.priority - right.priority);
    for (const { task } of tasks) task();
  }
}
