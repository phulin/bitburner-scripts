import {
  accessHosts,
  allHosts,
  hackableHosts,
  nukeHosts,
  potentialValue,
  PQueue,
  sumValues,
  targetValue,
} from "./lib";

const HACK_SCRIPTS = ["/basic/hack.js", "/basic/grow.js", "/basic/weaken.js"];

const TIME_EPSILON = 80; // milliseconds

const HACK_FRACTION = 0.4;

const MIN_THREADS = 4;

const MAX_BATCHES = 1000;

const TARGET_THRESHOLD = 0.4;

const SERVER_SIZE = 20;

enum Event {
  HACK,
  GROW,
  WEAKEN,
}

let _scriptRam = 0;
function scriptRam(ns: NS) {
  if (_scriptRam === 0) {
    _scriptRam = Math.max(
      ...HACK_SCRIPTS.map((script) => ns.getScriptRam(script))
    );
  }
  return _scriptRam;
}

function threadsAvailable(ns: NS, source: string) {
  return Math.floor(
    (ns.getServerMaxRam(source) -
      ns.getServerUsedRam(source) -
      (source === "home" ? 64 : 0)) /
      scriptRam(ns)
  );
}

function setupThreads(ns: NS, target: string, maxThreads: number) {
  const moneyMultiplierNeeded =
    ns.getServerMaxMoney(target) /
    Math.max(50, ns.getServerMoneyAvailable(target));
  const growThreadsNeeded = Math.ceil(
    ns.growthAnalyze(target, moneyMultiplierNeeded, 1)
  );
  // ns.print(`grow needed ${growThreadsNeeded}`);

  const growSecurity = ns.growthAnalyzeSecurity(growThreadsNeeded);
  const weakenNeeded =
    ns.getServerSecurityLevel(target) +
    growSecurity -
    ns.getServerMinSecurityLevel(target);
  // ns.print(`weaken needed ${weakenNeeded}`);
  const weakenEffect = ns.weakenAnalyze(1, 1);
  // ns.print(`weaken effect ${weakenEffect}`);
  const weakenThreadsNeeded = Math.ceil(weakenNeeded / weakenEffect);
  // ns.print(`weaken threads ${weakenThreadsNeeded}`);

  const totalNeeded = growThreadsNeeded + weakenThreadsNeeded;

  let weakenThreads, growThreads;
  if (
    ns.getHackingLevel() - ns.getServerRequiredHackingLevel(target) < 400 &&
    ns.getServerSecurityLevel(target) >
      1.3 * ns.getServerMinSecurityLevel(target)
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
    [Event.GROW]: growThreads,
    [Event.WEAKEN]: weakenThreads,
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
    ns.hackAnalyzeSecurity(hackThreadsNeeded) +
    ns.growthAnalyzeSecurity(growThreadsNeeded);
  const weakenEffect = ns.weakenAnalyze(1, 1);
  const weakenThreadsNeeded = hackSecurity / weakenEffect;

  const totalNeeded =
    hackThreadsNeeded + growThreadsNeeded + weakenThreadsNeeded;
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
    [Event.HACK]: hackThreads,
    [Event.GROW]: growThreads,
    [Event.WEAKEN]: weakenThreads,
  };
}

function usefulHosts(ns: NS) {
  if (ns.getServerMaxRam("home") > 8192) {
    return ["home", ...ns.getPurchasedServers()];
  } else {
    return accessHosts(ns).filter((host) => !host.includes("hacknet"));
  }
}

class Scheduler {
  ns: NS;
  scheduledTasks: PQueue<Task>;
  availableSources: string[];

  constructor(ns: NS, scheduledTasks: PQueue<Task>) {
    this.ns = ns;
    this.scheduledTasks = scheduledTasks;
    this.availableSources = usefulHosts(ns).filter(
      (source) => threadsAvailable(ns, source) > 0
    );
  }

  run(event: Event, threads: number, target: string, delay: number) {
    const ns = this.ns;
    const requested = threads;
    const script = {
      [Event.HACK]: "/basic/hack.js",
      [Event.GROW]: "/basic/grow.js",
      [Event.WEAKEN]: "/basic/weaken.js",
    }[event];
    ns.print(`scheduling ${threads} ${script} to ${target}`);

    while (this.availableSources.length > 0 && threads > 0) {
      const source = this.availableSources[0];
      const available = threadsAvailable(ns, source);
      const sourceThreads = Math.min(available, threads);
      ns.exec(script, source, sourceThreads, target, delay);
      if (sourceThreads === available) {
        this.availableSources.splice(0, 1);
      }
      threads -= sourceThreads;
    }

    if (threads > 0) {
      ns.print(
        `Warning: Only scheduled ${
          requested - threads
        } out of ${requested} for ${event}`
      );
    }

    // const endTime = {
    // 	[Event.HACK]: hackTime,
    // 	[Event.GROW]: 3.2 * hackTime,
    // 	[Event.WEAKEN]: 4 * hackTime,
    // }[event] + Date.now() + delay;
    // return [event, endTime];
  }
}

function nukeAndSelectTargets(ns: NS) {
  nukeHosts(ns, allHosts(ns));
  const hosts = hackableHosts(ns).filter(
    (host) =>
      Number.isFinite(targetValue(ns, host)) &&
      Number.isFinite(potentialValue(ns, host))
  );
  let sorted = hosts.sort(
    (x, y) => -(potentialValue(ns, x) - potentialValue(ns, y))
  );
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
  event: Event;
  target: string;
  threads: number;
  deadline: number;
};

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.tail();

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

    const primaryTargets = nukeAndSelectTargets(ns);
    if (forceTarget && typeof forceTarget === "string") {
      if (primaryTargets.includes(forceTarget)) {
        primaryTargets.splice(primaryTargets.indexOf(forceTarget), 1);
      }
      primaryTargets.splice(0, 0, forceTarget);
    }
    ns.print(`selected targets ${primaryTargets}`);

    const allProcesses = [...allHosts(ns)].map((host) => ns.ps(host)).flat();
    const skipTargets = allProcesses
      .filter((process) => process.filename.includes("weaken.js"))
      .map((process) => `${process.args[0]}`)
      .filter((target) => primaryTargets.includes(target));

    const sources = usefulHosts(ns);
    let copied = false;
    for (const script of HACK_SCRIPTS) {
      for (const source of sources) {
        if (!ns.fileExists(script, source)) {
          await ns.scp(script, source);
          copied = true;
        }
      }
    }
    if (copied) await ns.sleep(200);

    const needsSetup = primaryTargets.filter(
      (host) =>
        ns.getServerSecurityLevel(host) >
          1.1 * ns.getServerMinSecurityLevel(host) ||
        ns.getServerMoneyAvailable(host) < 0.7 * ns.getServerMaxMoney(host)
    );

    let totalThreadsAvailable = sumValues(
      sources.map((source) => threadsAvailable(ns, source))
    );

    const targetDeadlines: { [index: string]: number } = {};

    const scheduler = new Scheduler(ns, scheduledTasks);
    let round = 0;
    let batch = 0;

    while (totalThreadsAvailable > MIN_THREADS && batch < MAX_BATCHES) {
      if (primaryTargets.every((host) => skipTargets.includes(host))) break;
      for (const target of primaryTargets) {
        const hackTime = ns.getHackTime(target);
        const delay = 3 * round * TIME_EPSILON;
        if (skipTargets.includes(target)) {
          // don't do anything
        } else if (needsSetup.includes(target)) {
          const threads = setupThreads(ns, target, totalThreadsAvailable);
          scheduler.run(Event.WEAKEN, threads[Event.WEAKEN], target, 0);
          scheduler.run(
            Event.GROW,
            threads[Event.GROW],
            target,
            delay + 0.8 * hackTime - TIME_EPSILON
          );
          totalThreadsAvailable -= threads[Event.WEAKEN] + threads[Event.GROW];
          skipTargets.push(target);
        } else {
          const threads = hackThreads(ns, target, totalThreadsAvailable);
          scheduler.run(
            Event.HACK,
            threads[Event.HACK],
            target,
            delay + 3 * hackTime - 2 * TIME_EPSILON
          );
          scheduler.run(
            Event.GROW,
            threads[Event.GROW],
            target,
            delay + 0.8 * hackTime - TIME_EPSILON
          );
          scheduler.run(Event.WEAKEN, threads[Event.WEAKEN], target, delay);
          totalThreadsAvailable -=
            threads[Event.HACK] + threads[Event.GROW] + threads[Event.WEAKEN];

          // If this is the first HGW we've scheduled, don't scheduled another to start after the waiting period for H.
          if (targetDeadlines[target] === undefined) {
            targetDeadlines[target] =
              Date.now() + 3 * hackTime - 2 * TIME_EPSILON;
          }
          if (Date.now() + delay + 6 * TIME_EPSILON > targetDeadlines[target]) {
            skipTargets.push(target);
          }
        }
        batch++;
        if (batch % 50 === 0) {
          await ns.sleep(0.001);
        }
        if (totalThreadsAvailable <= MIN_THREADS || batch >= MAX_BATCHES) break;
      }

      round++;
    }

    if (totalThreadsAvailable > 0) {
      const waitStart = Date.now();
      while (Date.now() < waitStart + 10 * TIME_EPSILON) {
        // Spend all remaining threads generating xp.
        scheduler.run(Event.WEAKEN, totalThreadsAvailable, "joesguns", 0);
        await ns.sleep(ns.getWeakenTime("joesguns") + 2 * TIME_EPSILON);
      }
    } else {
      await ns.sleep(10 * TIME_EPSILON);
    }
  }
}
