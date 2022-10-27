import {
  accessHosts,
  allHosts,
  formatDuration,
  hackableHosts,
  nukeHosts,
  potentialValue,
  PQueue,
  solveGrow,
  sum,
  targetValue,
  tightSleepUntil,
} from "./lib";

const TIME_EPSILON = 150; // milliseconds

const HACK_FRACTION = 0.5;

const MAX_BATCHES = 1000;

const TARGET_THRESHOLD = 0.4;

const SERVER_PURCHASE_INTERVAL = 3 * 60 * 1000;

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
  const growThreadsNeeded = solveGrow(
    ns,
    target,
    ns.getServerMoneyAvailable(target),
    ns.getServerMaxMoney(target)
  );
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
  const fullSuccess = weakenThreads === weakenThreadsNeeded && growThreads === growThreadsNeeded;
  return {
    fullSuccess,
    threads: {
      [TaskType.GROW]: growThreads,
      [TaskType.WEAKEN]: weakenThreads,
    },
  };
}

function hackThreads(ns: NS, target: string, maxThreads: number, startingMoney: number) {
  // ns.print(`${threads} available`);
  const player = ns.getPlayer();
  const server = ns.getServer(target);

  const hackThreadsNeeded = ns.hackAnalyzeThreads(
    target,
    HACK_FRACTION * ns.getServerMoneyAvailable(target)
  );
  // ns.print(`${hackThreadsNeeded} hack`);
  const growThreadsNeeded = solveGrow(
    ns,
    target,
    (1 - HACK_FRACTION) * startingMoney,
    server.moneyMax
  );

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
    endingMoney:
      startingMoney *
      (1 - hackThreads * ns.formulas.hacking.hackPercent(server, player)) *
      ns.formulas.hacking.growPercent(server, growThreads, player, 1),
    threads: {
      [TaskType.HACK]: hackThreads,
      [TaskType.GROW]: growThreads,
      [TaskType.WEAKEN]: weakenThreads,
    },
  };
}

function runTask(
  ns: NS,
  scheduledTasks: PQueue<Task>,
  runningTasks: PQueue<Task>,
  task: Task,
  startTime: number
) {
  const { threads, taskType, target, source, deadline } = task;
  // const available = threadsAvailable(ns, source, scheduledTasks);
  // const delay = startTime - Date.now();
  // const runtime = timeNeeded(ns, taskType, target);
  // if (target === "phantasy") {
  //   ns.tprint(
  //     `running ${threads} ${
  //       TASK_SCRIPTS[taskType]
  //     } ${target} on ${source} (${available} avail) in ${delay.toFixed(
  //       0
  //     )} ms, deadline ${formatTime(deadline)} starting ${formatTime(startTime)}`
  //   );
  // }
  uniqueNumber++;
  if (ns.exec(TASK_SCRIPTS[taskType], source, threads, target, startTime, uniqueNumber) === 0) {
    ns.print(
      `WARNING: Failed to start. Would have used ${threads * scriptRam(ns)} of ${(
        ns.getServerMaxRam(source) - ns.getServerUsedRam(source)
      ).toFixed(0)}.`
    );
  } else {
    runningTasks.insert(task, deadline);
  }
}

function usefulHosts(ns: NS) {
  if (ns.getServerMaxRam("home") > 32768) {
    return [
      "home",
      ...ns.getPurchasedServers(),
      ...accessHosts(ns).filter((host) => ns.args.includes("hacknet") && host.includes("hacknet")),
    ];
  } else {
    return accessHosts(ns).filter(
      (host) => ns.args.includes("hacknet") || !host.includes("hacknet")
    );
  }
}

function allProcesses(ns: NS) {
  return [...allHosts(ns)].map((host) => ns.ps(host)).flat();
}

class Scheduler {
  ns: NS;
  scheduledTasks: PQueue<Task>;
  runningTasks: PQueue<Task>;
  availableSources: [string, number][];

  constructor(ns: NS, scheduledTasks: PQueue<Task>, runningTasks: PQueue<Task>) {
    this.ns = ns;
    this.scheduledTasks = scheduledTasks;
    this.runningTasks = runningTasks;
    this.availableSources = usefulHosts(ns)
      .map((source) => [source, threadsAvailable(ns, source, scheduledTasks)] as [string, number])
      .filter(([, threads]) => threads > 0);
  }

  run(taskType: TaskType, threads: number, target: string, deadline: number) {
    const ns = this.ns;
    const requested = threads;
    const duration = timeNeeded(ns, taskType, target);

    ns.print(
      `scheduling ${threads} ${TaskType[taskType]} to ${target}, expected ${formatDuration(
        duration
      )}`
    );

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
        runTask(ns, this.scheduledTasks, this.runningTasks, task, Date.now());
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

function hostNeedsSetup(ns: NS, host: string) {
  return (
    ns.getServerSecurityLevel(host) > 1.1 * ns.getServerMinSecurityLevel(host) ||
    ns.getServerMoneyAvailable(host) < 0.7 * ns.getServerMaxMoney(host)
  );
}

function nukeAndSelectTargets(ns: NS) {
  nukeHosts(ns, allHosts(ns));
  const allHostValues = hackableHosts(ns).map((host): [string, number, number] => [
    host,
    targetValue(ns, host),
    potentialValue(ns, host),
  ]);
  const hosts = allHostValues.filter(
    ([, target, potential]) => Number.isFinite(target) && Number.isFinite(potential)
  );

  let sorted = hosts.sort(([, , potentialX], [, , potentialY]) => -(potentialX - potentialY));
  if (ns.getHackingLevel() > 100) {
    sorted = sorted.filter(([host]) => host !== "n00dles");
  }
  const [, , bestPotentialValue] = sorted[0];

  const targets = sorted.filter(
    ([, , potential]) => potential > TARGET_THRESHOLD * bestPotentialValue
  );
  const bestCurrent = hosts
    .filter(([host]) => host !== "n00dles" && !hostNeedsSetup(ns, host))
    .sort(([, targetX], [, targetY]) => -(targetX - targetY))[0];
  if (bestCurrent && !targets.includes(bestCurrent)) targets.push(bestCurrent);
  return targets.map(([host]) => host);
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
  ns.tail();
  let lastStatus = 0;

  let forceTarget: string | null = null;
  let noBuy = false;
  for (const arg of ns.args) {
    if (arg === "nobuy") {
      noBuy = true;
    } else if (typeof arg === "string" && ns.serverExists(arg)) {
      forceTarget = arg;
    }
  }
  if (forceTarget) ns.print(`forcing target ${forceTarget}`);

  const scheduledTasks = new PQueue<Task>();
  const runningTasks = new PQueue<Task>();

  let lastServerPurchase = 0; // Timestamp of last purchase

  while (true) {
    // Every so often, buy the biggest server we can, starting with home ram size.
    if (
      !noBuy &&
      Date.now() - lastServerPurchase > SERVER_PURCHASE_INTERVAL &&
      ns.getPurchasedServers().length < ns.getPurchasedServerLimit()
    ) {
      const maximumRam = Math.max(
        ...["home", ...ns.getPurchasedServers()].map((host) => ns.getServerMaxRam(host))
      );
      const minimumSize = Math.round(Math.log2(maximumRam));
      let size;
      let canPurchase = false;
      for (size = 20; size >= minimumSize; size--) {
        if (ns.getPlayer().money >= 3 * ns.getPurchasedServerCost(1 << size)) {
          canPurchase = true;
          break;
        }
      }
      // ns.print(`trying to buy server, min size ${minimumSize}, size ${size}`);
      while (
        canPurchase &&
        ns.getPlayer().money >= 3 * ns.getPurchasedServerCost(1 << size) &&
        ns.getPurchasedServers().length < ns.getPurchasedServerLimit()
      ) {
        let name = "foo0";
        for (let i = 0; i < ns.getPurchasedServerLimit(); i++) {
          if (!ns.serverExists(`foo${i}`)) {
            name = `foo${i}`;
            break;
          }
        }
        if (ns.purchaseServer(name, 1 << size) === "") {
          ns.tprint(`Purchasing server ${name} with size ${1 << size} GB.`);
          for (const script of ["/lib.js", ...HACK_SCRIPTS]) {
            await ns.scp(script, name);
          }
          lastServerPurchase = Date.now();
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

    const needsSetup = [...primaryTargets].filter((host) => hostNeedsSetup(ns, host));

    let totalThreadsAvailable = sum(
      sources.map((source) => threadsAvailable(ns, source, scheduledTasks))
    );
    // Don't schedule on the last target if we're doing less than 5% of total.
    const minThreads = Math.floor(totalThreadsAvailable * 0.05);

    const scheduler = new Scheduler(ns, scheduledTasks, runningTasks);
    let round = 0;
    let batch = 0;

    const predictedMoney: { [index: string]: number } = {};

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
          const { fullSuccess, threads } = setupThreads(ns, target, totalThreadsAvailable);
          scheduler.run(TaskType.WEAKEN, threads[TaskType.WEAKEN], target, weakenDeadline);
          scheduler.run(
            TaskType.GROW,
            threads[TaskType.GROW],
            target,
            weakenDeadline - TIME_EPSILON
          );
          totalThreadsAvailable -= threads[TaskType.WEAKEN] + threads[TaskType.GROW];
          if (
            !fullSuccess ||
            ns.getServerSecurityLevel(target) > 1.1 * ns.getServerMinSecurityLevel(target)
          ) {
            // if security is still low we can just HGW right after this GW.
            skipTargets.push(target);
          } else if (fullSuccess) {
            const index = needsSetup.indexOf(target);
            if (index !== -1) needsSetup.splice(index, 1);
            predictedMoney[target] = ns.getServerMaxMoney(target);
          }
        } else {
          // if round > 0, we'll be at full already.
          const startingMoney = predictedMoney[target] ?? ns.getServerMoneyAvailable(target);
          const { endingMoney, threads } = hackThreads(
            ns,
            target,
            totalThreadsAvailable,
            startingMoney
          );
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
          predictedMoney[target] = endingMoney;
          totalThreadsAvailable -=
            threads[TaskType.HACK] + threads[TaskType.GROW] + threads[TaskType.WEAKEN];
        }

        // run any ready-to-go tasks.

        const nextTask = scheduledTasks.peek();
        if (nextTask && nextTask[1] - Date.now() < 5 * TIME_EPSILON) {
          await tightSleepUntil(ns, Math.max(Date.now(), nextTask[1] - TIME_EPSILON));
        }

        // Execute any tasks which are ready to go.
        runScheduledTasks(ns, scheduledTasks, runningTasks);

        batch++;
        if (batch % 10 === 0) {
          await ns.sleep(0.001);
        }
        if (totalThreadsAvailable <= minThreads || batch >= MAX_BATCHES) break;
      }

      round++;
    }

    // Clean up runningTasks.
    const firstRunningIndex = runningTasks.entries.findIndex(
      ([, deadline]) => Date.now() < deadline
    );
    runningTasks.pop(firstRunningIndex === -1 ? runningTasks.entries.length : firstRunningIndex);

    const joeWeakenTime = ns.getWeakenTime("joesguns");
    const remainingTotalThreadsAvailable = sum(
      sources.map((source) => threadsAvailable(ns, source, scheduledTasks))
    );
    let interstitialThreads = 0;

    // If we can fit some interstitial XP gain in, do it.
    if (
      remainingTotalThreadsAvailable > minThreads &&
      !allProcesses(ns).some(
        (process) => process.filename.includes("weaken.js") && process.args[0] === "joesguns"
      )
    ) {
      for (const source of sources) {
        const nextRunning = runningTasks.entries.find(
          ([{ source: otherSource }]) => source === otherSource
        );
        const nextScheduled = scheduledTasks.entries.find(
          ([{ source: otherSource }]) => source === otherSource
        );
        const threads = threadsAvailable(ns, source, scheduledTasks);
        if (
          threads > 0 &&
          (!nextScheduled || nextScheduled[1] - Date.now() > joeWeakenTime + 2 * TIME_EPSILON) &&
          (!nextRunning || nextRunning[1] - Date.now() > joeWeakenTime + 2 * TIME_EPSILON)
        ) {
          ns.exec(TASK_SCRIPTS[TaskType.WEAKEN], source, threads, "joesguns");
          interstitialThreads += threads;
        }
      }
    }
    if (interstitialThreads > 0) {
      ns.print(`scheduled ${interstitialThreads} interstital weaken for XP.`);
    }

    // Recalculate start times for all scheduled tasks.
    scheduledTasks.prioritize(
      ({ taskType, target, deadline }) => deadline - timeNeeded(ns, taskType, target)
    );

    const nextTask = scheduledTasks.peek();
    if (nextTask && nextTask[1] - Date.now() < 5 * TIME_EPSILON) {
      await tightSleepUntil(ns, Math.max(Date.now(), nextTask[1] - TIME_EPSILON));
    } else {
      await ns.sleep(3 * TIME_EPSILON);
    }

    // Recalculate start times for all scheduled tasks.
    scheduledTasks.prioritize(
      ({ taskType, target, deadline }) => deadline - timeNeeded(ns, taskType, target)
    );

    // Execute any tasks which are ready to go.
    runScheduledTasks(ns, scheduledTasks, runningTasks);
  }
}

function runScheduledTasks(ns: NS, scheduledTasks: PQueue<Task>, runningTasks: PQueue<Task>) {
  let nextScheduled = scheduledTasks.peek();
  while ((nextScheduled = scheduledTasks.peek()) && nextScheduled[1] - Date.now() < TIME_EPSILON) {
    scheduledTasks.pop();
    const [task] = nextScheduled;
    const { taskType, target, deadline } = task;

    // Recalculate start times for all scheduled tasks.
    const updatedStartTime = deadline - timeNeeded(ns, taskType, target);

    if (updatedStartTime - Date.now() < -TIME_EPSILON / 2) {
      ns.print(
        `WARNING: Passed start time for ${TaskType[taskType]} ${target} by ${(
          Date.now() - updatedStartTime
        ).toFixed(0)} ms. Skipping.`
      );
      if (taskType === TaskType.GROW) {
        // Okay, we missed a grow. Have to cancel any corresponding hack.
        // Hack comes TIME_EPSILON before grow, so cancel any hacks in range deadline + [-2E, 0]
        for (let i = scheduledTasks.entries.length - 1; i >= 0; i--) {
          const [{ taskType: otherTaskType, target: otherTarget, deadline: otherDeadline }] =
            scheduledTasks.entries[i];
          if (
            otherTaskType === TaskType.HACK &&
            otherTarget === target &&
            deadline - 2 * TIME_EPSILON < otherDeadline &&
            otherDeadline < deadline
          ) {
            scheduledTasks.entries.splice(i, 1);
          }
        }
      }
      continue;
    }
    runTask(ns, scheduledTasks, runningTasks, task, updatedStartTime);
  }
}
