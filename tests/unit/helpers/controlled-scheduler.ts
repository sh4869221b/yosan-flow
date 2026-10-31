import type { Scheduler } from "effect";

export class ControlledScheduler implements Scheduler.Scheduler {
  // fallow-ignore-next-line unused-class-member -- Required by the Scheduler interface passed to Effect.runFork.
  readonly executionMode = "async";
  private tasks: Array<{ task: () => void; priority: number }> = [];
  // fallow-ignore-next-line unused-class-member -- Required by the Scheduler interface passed to Effect.runFork.
  shouldYield(): boolean {
    return false;
  }

  // fallow-ignore-next-line unused-class-member -- Required by the Scheduler interface passed to Effect.runFork.
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
