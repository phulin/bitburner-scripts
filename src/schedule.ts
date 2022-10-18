import {
  accessHosts,
  allHosts,
  formatTime,
  hackableHosts,
  nukeHosts,
  potentialValue,
  PQueue,
  sum,
  targetValue,
  tightSleepUntil,
} from "./lib";

const TIME_EPSILON = 100; // milliseconds

const HACK_FRACTION = 0.5;

const MAX_BATCHES = 1000;

const TARGET_THRESHOLD = 0.4;

const SERVER_SIZE = 20;

enum TaskType {
  HACK,
  GROW,
  WEAKEN,
}
const TASK_SCRIPTS: { [index: number]: string } = {
  [TaskType.HACK]: "/basic/hack.js",
  [TaskType.GROW]: "/basic/grow.js",
  [TaskType.WEAKEN]: "/basic/weaken.js",
};
const HACK_SCRIPTS = Object.values(TASK_SCRIPTS);

let uniqueNumber = 0;

let _scriptRam = 0;
function scriptRam(ns: NS) {
  if (_scriptRam === 0) {
    _scriptRam = Math.max(...HACK_SCRIPTS.map((script) => ns.getScriptRam(script)));
  }
  return _scriptRam;
}

function timeNeeded(ns: NS, taskType: TaskType, target: string) {
  const hackTime = ns.getHackTime(target);
  return {
    [TaskType.HACK]: hackTime,
    [TaskType.GROW]: 3.2 * hackTime,
    [TaskType.WEAKEN]: 4 * hackTime,
  }[taskType];
}

function threadsAvailable(ns: NS, source: string, scheduledTasks: PQueue<Task>) {
  const tasksHere = scheduledTasks.entries.filter(([{ source: source2 }]) => source2 === source);
  const threadsScheduled = sum(tasksHere.map(([{ threads }]) => threads));
  const currentRamFree =
    ns.getServerMaxRam(source) - ns.getServerUsedRam(source) - (source === "home" ? 64 : 0);
  const currentThreadsFree = Math.floor(currentRamFree / scriptRam(ns));
  return Math.max(0, currentThreadsFree - threadsScheduled);
}

function setupThreads(ns: NS, target: string, maxThreads: number) {
  const moneyMultiplierNeeded =
    ns.getServerMaxMoney(target) / Math.max(50, ns.getServerMoneyAvailable(target));
  const growThreadsNeeded = Math.ceil(ns.growthAnalyze(target, moneyMultiplierNeeded, 1));
  // ns.print(`grow needed ${growThreadsNeeded}`);

  const growSecurity = ns.growthAnalyzeSecurity(growThreadsNeeded);
  const weakenNeeded =
    ns.getServerSecurityLevel(target) + growSecurity - ns.getServerMinSecurityLevel(target);
  // ns.print(`weaken needed ${weakenNeeded}`);
  const weakenEffect = ns.weakenAnalyze(1, 1);
  // ns.print(`weaken effect ${weakenEffect}`);
  const weakenThreadsNeeded = Math.ceil(weakenNeeded / weakenEffect);
  // ns.print(`weaken threads ${weakenThreadsNeeded}`);

  const totalNeeded = growThreadsNeeded + weakenThreadsNeeded;

  let weakenThreads, growThreads;
  if (
    ns.getHackingLevel() - ns.getServerRequiredHackingLevel(target) < 400 &&
    ns.getServerSecurityLevel(target) > 1.3 * ns.getServerMinSecurityLevel(target)
  ) {
    // Focus on weakening first, not balanced approach.
    weakenThreads = Math.min(weakenThreadsNeeded, maxThreads);
    growThreads = Math.min(growThreadsNeeded, maxThreads - weakenThreads);
  } else {
    const adjustFraction = Math.min(1, maxThreads / totalNeeded);
    weakenThreads = Math.ceil(adjustFraction * weakenThreadsNeeded);
    growThreads = Math.min(
      Math.ceil(adjustFraction * growThreadsNeeded),
      maxThreads - weakenThreads
    );
  }

  ns.print(`setting up ${target}: [${growThreads}, ${weakenThreads}]`);
  return {
    [TaskType.GROW]: growThreads,
    [TaskType.WEAKEN]: weakenThreads,
  };
}

function hackThreads(ns: NS, target: string, maxThreads: number) {
  // ns.print(`${threads} available`);

  const hackThreadsNeeded = ns.hackAnalyzeThreads(
    target,
    HACK_FRACTION * ns.getServerMoneyAvailable(target)
  );
  // ns.print(`${hackThreadsNeeded} hack`);
  const growThreadsNeeded = ns.growthAnalyze(target, 1 / HACK_FRACTION, 1);

  const hackSecurity =
    ns.hackAnalyzeSecurity(hackThreadsNeeded) + ns.growthAnalyzeSecurity(growThreadsNeeded);
  const weakenEffect = ns.weakenAnalyze(1, 1);
  const weakenThreadsNeeded = hackSecurity / weakenEffect;

  const totalNeeded = hackThreadsNeeded + growThreadsNeeded + weakenThreadsNeeded;
  const adjustFraction = Math.min(1, maxThreads / totalNeeded);
  // ns.print(`${totalNeeded} needed`);

  const growThreads = Math.ceil(adjustFraction * growThreadsNeeded);
  const weakenThreads = Math.ceil(adjustFraction * weakenThreadsNeeded);
  const hackThreads = Math.min(
    Math.ceil(adjustFraction * hackThreadsNeeded),
    maxThreads - growThreads - weakenThreads
  );

  // ns.print(`predicted hack ${ns.hackAnalyze(target) * hackThreads}`);
  // ns.print(`predicted grow ${(ns.getServerMoneyAvailable(target) - ns.hackAnalyze(target) * hackThreads) * ns.growthAnalyze()}`);

  return {
    [TaskType.HACK]: hackThreads,
    [TaskType.GROW]: growThreads,
    [TaskType.WEAKEN]: weakenThreads,
  };
}

function runTask(
  ns: NS,
  scheduledTasks: PQueue<Task>,
  { threads, taskType, target, source, deadline }: Task,
  startTime: number
) {
  const available = threadsAvailable(ns, source, scheduledTasks);
  const delay = startTime - Date.now();
  // const runtime = timeNeeded(ns, taskType, target);
  if (target === "phantasy") {
    ns.tprint(
      `running ${threads} ${
        TASK_SCRIPTS[taskType]
      } ${target} on ${source} (${available} avail) in ${delay.toFixed(
        0
      )} ms, deadline ${formatTime(deadline)} starting ${formatTime(startTime)}`
    );
  }
  uniqueNumber++;
  if (ns.exec(TASK_SCRIPTS[taskType], source, threads, target, startTime, uniqueNumber) === 0) {
    ns.print(
      `WARNING: Failed to start. Would have used ${threads * scriptRam(ns)} of ${(
        ns.getServerMaxRam(source) - ns.getServerUsedRam(source)
      ).toFixed(0)}.`
    );
  }
}

function usefulHosts(ns: NS) {
  if (ns.getServerMaxRam("home") > 8192) {
    return ["home", ...ns.getPurchasedServers()];
  } else {
    return accessHosts(ns).filter((host) => !host.includes("hacknet"));
  }
}

function allProcesses(ns: NS) {
  return [...allHosts(ns)].map((host) => ns.ps(host)).flat();
}

class Scheduler {
  ns: NS;
  scheduledTasks: PQueue<Task>;
  availableSources: [string, number][];

  constructor(ns: NS, scheduledTasks: PQueue<Task>) {
    this.ns = ns;
    this.scheduledTasks = scheduledTasks;
    this.availableSources = usefulHosts(ns)
      .map((source) => [source, threadsAvailable(ns, source, scheduledTasks)] as [string, number])
      .filter(([, threads]) => threads > 0);
  }

  run(taskType: TaskType, threads: number, target: string, deadline: number) {
    const ns = this.ns;
    const requested = threads;
    ns.print(`scheduling ${threads} ${TaskType[taskType]} to ${target}`);

    const duration = timeNeeded(ns, taskType, target);

    for (const entry of this.availableSources) {
      if (threads <= 0) break;
      const [source, sourceThreadsAvailable] = entry;
      const sourceThreads = Math.min(sourceThreadsAvailable, threads);
      const task = {
        taskType: taskType,
        threads: sourceThreads,
        source,
        target,
        deadline,
      };
      if (deadline - duration > Date.now()) {
        this.scheduledTasks.insert(task, deadline - duration);
      } else {
        runTask(ns, this.scheduledTasks, task, Date.now());
      }
      threads -= sourceThreads;
      entry[1] -= sourceThreads;
    }
    this.availableSources = this.availableSources.filter(([, t]) => t > 0);

    if (threads > 0) {
      ns.print(
        `Warning: Only scheduled ${requested - threads} out of ${requested} for ${taskType}`
      );
    }
  }
}

function nukeAndSelectTargets(ns: NS) {
  nukeHosts(ns, allHosts(ns));
  const hosts = hackableHosts(ns).filter(
    (host) => Number.isFinite(targetValue(ns, host)) && Number.isFinite(potentialValue(ns, host))
  );
  let sorted = hosts.sort((x, y) => -(potentialValue(ns, x) - potentialValue(ns, y)));
  if (ns.getHackingLevel() > 100) {
    sorted = sorted.filter((host) => host !== "n00dles");
  }
  const bestPotentialValue = potentialValue(ns, sorted[0]);
  const targets = sorted.filter(
    (host) => potentialValue(ns, host) > TARGET_THRESHOLD * bestPotentialValue
  );
  const bestCurrent = hosts
    .filter((host) => host !== "n00dles")
    .sort((x, y) => -(targetValue(ns, x) - targetValue(ns, y)))[0];
  if (!targets.includes(bestCurrent)) targets.push(bestCurrent);
  return targets;
}

type Task = {
  taskType: TaskType;
  threads: number;
  source: string;
  target: string;
  deadline: number;
};

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  window.print = ns.print;
  ns.tail();
  let lastStatus = 0;

  const forceTarget = ns.args[0];
  if (forceTarget) ns.print(`forcing target ${forceTarget}`);

  // Weakens happen at most every 3 * TIME_EPSILON.
  // key: host
  // value: list of { type: event type, threads, target, startTime/endTime: Date.now-style mili value of START time }
  const scheduledTasks = new PQueue<Task>();

  // for (const host of hackableHosts(ns)) {
  // 	ns.print(`${host} ${targetValue(ns, host).toFixed(1)} ${potentialValue(ns, host).toFixed(1)}`);
  // }

  while (true) {
    // Buy servers.
    if (SERVER_SIZE > 0) {
      while (
        ns.getPlayer().money >= ns.getPurchasedServerCost(2 ** SERVER_SIZE) &&
        ns.getPurchasedServers().length < ns.getPurchasedServerLimit()
      ) {
        const name = `foo${ns.getPurchasedServers().length}`;
        if (ns.purchaseServer(name, 2 ** SERVER_SIZE) === "") {
          ns.print(`bought server ${name}`);
          for (const script of HACK_SCRIPTS) {
            await ns.scp(script, name);
          }
          break;
        }
      }
    }

    let primaryTargets = new Set(nukeAndSelectTargets(ns));
    if (forceTarget && typeof forceTarget === "string") {
      primaryTargets = new Set([forceTarget]);
    }

    const seconds = Math.floor(Date.now() / 1000);
    if (seconds > lastStatus) {
      ns.print(
        `[${new Date().toISOString().slice(11, 19)}] selected targets ${[...primaryTargets]
          .map((target) => target.slice(0, 5))
          .join(", ")}`
      );
      lastStatus = seconds;
    }

    let skipTargets = [
      ...allProcesses(ns)
        .filter((process) => process.filename.includes("weaken.js"))
        .map((process) => `${process.args[0]}`),
      ...scheduledTasks.entries.map(([{ target }]) => target),
    ];
    skipTargets = skipTargets.filter((target) => primaryTargets.has(target));
    skipTargets = [...new Set(skipTargets)];

    const sources = usefulHosts(ns);
    for (const script of ["lib.js", ...HACK_SCRIPTS]) {
      for (const source of sources.filter((source) => source !== "home")) {
        if (!ns.fileExists(script, source)) {
          await ns.scp(script, source);
        }
      }
    }

    const needsSetup = [...primaryTargets].filter(
      (host) =>
        ns.getServerSecurityLevel(host) > 1.1 * ns.getServerMinSecurityLevel(host) ||
        ns.getServerMoneyAvailable(host) < 0.7 * ns.getServerMaxMoney(host)
    );

    let totalThreadsAvailable = sum(
      sources.map((source) => threadsAvailable(ns, source, scheduledTasks))
    );
    // Don't schedule on the last target if we're doing less than 5% of total.
    const minThreads = Math.floor(totalThreadsAvailable * 0.05);

    const scheduler = new Scheduler(ns, scheduledTasks);
    let round = 0;
    let batch = 0;

    while (totalThreadsAvailable > minThreads && batch < MAX_BATCHES) {
      if ([...primaryTargets].every((host) => skipTargets.includes(host))) break;
      for (const target of primaryTargets) {
        const hackTime = ns.getHackTime(target);
        const delay = 3 * round * TIME_EPSILON + 3 * TIME_EPSILON;

        // Stop scheduling batches once we would be beginning tasks after others have started completing.
        if (delay > 0.8 * hackTime - TIME_EPSILON && !skipTargets.includes(target)) {
          skipTargets.push(target);
        }

        const weakenDeadline = Date.now() + delay + 4 * hackTime;
        if (skipTargets.includes(target)) {
          // don't do anything
        } else if (needsSetup.includes(target)) {
          const threads = setupThreads(ns, target, totalThreadsAvailable);
          scheduler.run(TaskType.WEAKEN, threads[TaskType.WEAKEN], target, weakenDeadline);
          scheduler.run(
            TaskType.GROW,
            threads[TaskType.GROW],
            target,
            weakenDeadline - TIME_EPSILON
          );
          totalThreadsAvailable -= threads[TaskType.WEAKEN] + threads[TaskType.GROW];
          skipTargets.push(target);
        } else {
          const threads = hackThreads(ns, target, totalThreadsAvailable);
          scheduler.run(
            TaskType.HACK,
            threads[TaskType.HACK],
            target,
            weakenDeadline - 2 * TIME_EPSILON
          );
          scheduler.run(
            TaskType.GROW,
            threads[TaskType.GROW],
            target,
            weakenDeadline - TIME_EPSILON
          );
          scheduler.run(TaskType.WEAKEN, threads[TaskType.WEAKEN], target, weakenDeadline);
          totalThreadsAvailable -=
            threads[TaskType.HACK] + threads[TaskType.GROW] + threads[TaskType.WEAKEN];
        }

        batch++;
        if (batch % 50 === 0) {
          await ns.sleep(0.001);
        }
        if (totalThreadsAvailable <= minThreads || batch >= MAX_BATCHES) break;
      }

      round++;
    }

    let next = scheduledTasks.peek();
    const joeWeakenTime = ns.getWeakenTime("joesguns");
    const remainingTotalThreadsAvailable = sum(
      sources.map((source) => threadsAvailable(ns, source, scheduledTasks))
    );
    if (
      remainingTotalThreadsAvailable > minThreads &&
      !allProcesses(ns).some(
        (process) => process.filename.includes("weaken.js") && process.args[0] === "joesguns"
      ) && // not if we're already weakening.
      (!next || next[1] - Date.now() > joeWeakenTime + TIME_EPSILON)
    ) {
      const deadline = Date.now() + ns.getWeakenTime("joesguns");
      scheduler.run(TaskType.WEAKEN, totalThreadsAvailable, "joesguns", deadline);
    }

    // Recalculate start times for all scheduled tasks.
    scheduledTasks.prioritize(
      ({ taskType, target, deadline }) => deadline - timeNeeded(ns, taskType, target)
    );

    const nextTask = scheduledTasks.peek();
    if (nextTask && nextTask[1] - Date.now() < 5 * TIME_EPSILON) {
      await tightSleepUntil(ns, Math.max(Date.now(), nextTask[1] - TIME_EPSILON));
    } else {
      await ns.sleep(5 * TIME_EPSILON);
    }

    // Recalculate start times for all scheduled tasks.
    scheduledTasks.prioritize(
      ({ taskType, target, deadline }) => deadline - timeNeeded(ns, taskType, target)
    );

    // Execute any tasks which are ready to go.
    next = scheduledTasks.peek();
    // ns.print(
    //   `now: ${Date.now().toFixed(0)} next task start: ${
    //     next ? next[1].toFixed(0) : "none"
    //   } deadline: ${next ? next[0].deadline.toFixed(0) : "none"}`
    // );
    while ((next = scheduledTasks.peek()) && next[1] - Date.now() < TIME_EPSILON) {
      scheduledTasks.pop();
      const [task, startTime] = next;
      const { taskType, target } = task;
      if (startTime - Date.now() < -TIME_EPSILON) {
        ns.print(
          `WARNING: Passed start time for ${TaskType[taskType]} ${target} by ${(
            Date.now() - startTime
          ).toFixed(0)} ms. Skipping.`
        );
        continue;
      }
      runTask(ns, scheduledTasks, task, startTime);
    }
  }
}
