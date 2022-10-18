import type { NS } from "@ns";

// Assuming ascending array, get GLB for el.
export function binarySearch<T>(
  ar: T[],
  el: T,
  keyF: (x: T) => number
): number {
  let m = 0;
  let n = ar.length - 1;
  const key = keyF(el);
  while (m <= n) {
    const k = (n + m) >> 1;
    if (key > keyF(ar[k])) {
      m = k + 1;
    } else if (key < keyF(ar[k])) {
      n = k - 1;
    } else {
      return k;
    }
  }
  return -m - 1;
}

export class PQueue<T> {
  #entries: [T, number][] = [];

  check(): void {
    for (let i = 0; i < this.#entries.length - 1; i++) {
      if (this.#entries[i][1] > this.#entries[i + 1][1]) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        window.print(this.#entries.join("; "));
        throw "Consistency error!";
      }
    }
  }

  insert(element: T, priority: number): void {
    const entry: [T, number] = [element, priority];
    const lubIndex = this.#entries.findIndex(
      ([, otherPriority]) => priority < otherPriority
    );
    this.#entries.splice(
      lubIndex === -1 ? this.#entries.length : lubIndex,
      0,
      entry
    );
    this.check();
  }

  prioritize(f: (element: T, priority: number) => number): void {
    this.#entries.forEach((entry) => {
      entry[1] = f(...entry);
    });
    this.#entries.sort(([, x], [, y]) => x - y);
    this.check();
  }

  pop(): [T, number] | undefined {
    return this.#entries.shift();
  }

  peek(): [T, number] | undefined {
    return this.#entries[0];
  }

  get entries(): [T, number][] {
    return [...this.#entries];
  }
}

export function targetValue(ns: NS, target: string, potential = false): number {
  const player = ns.getPlayer();
  const server = ns.getServer(target);
  if (potential) server.hackDifficulty = server.minDifficulty;
  return (
    (server.moneyMax / ns.formulas.hacking.weakenTime(server, player)) *
    ns.formulas.hacking.hackChance(server, player)
  );
}

/**
 * @param {NS} ns
 */
export function potentialValue(ns: NS, target: string): number {
  return targetValue(ns, target, true);
  // const adjustmentFactor = ns.getServerSecurityLevel(target) / ns.getServerMinSecurityLevel(target);
  // const hackEffect = Math.min(0.999, ns.hackAnalyze(target) * adjustmentFactor);
  // const growTime = ns.getGrowTime(target) / adjustmentFactor;
  // return hackEffect * ns.getServerMaxMoney(target) ** 1.1 /
  // 	(ns.growthAnalyze(target, 1 / (1 - hackEffect), 1) * (growTime + 20 * TIME_EPSILON));
}

export function canHack(ns: NS, host: string): boolean {
  return ns.getServerRequiredHackingLevel(host) <= ns.getHackingLevel();
}

export function allHosts(
  ns: NS,
  host = "home",
  visited = new Set<string>()
): Set<string> {
  visited.add(host);
  for (const nextHost of ns.scan(host)) {
    if (!visited.has(nextHost)) {
      allHosts(ns, nextHost, visited);
    }
  }
  return visited;
}

export function accessHosts(ns: NS): string[] {
  return [...allHosts(ns, ns.getHostname(), new Set())].filter((host) =>
    ns.hasRootAccess(host)
  );
}

export function hackableHosts(ns: NS): string[] {
  return [...allHosts(ns, ns.getHostname(), new Set())].filter(
    (host) =>
      host !== "home" &&
      ns.hasRootAccess(host) &&
      canHack(ns, host) &&
      ns.getServerMaxMoney(host) > 0
  );
}

const programs: { [index: string]: number } = {
  "BruteSSH.exe": 0.5 * 1000 * 1000,
  "FTPCrack.exe": 1.5 * 1000 * 1000,
  "relaySMTP.exe": 5 * 1000 * 1000,
  "HTTPWorm.exe": 30 * 1000 * 1000,
  "SQLInject.exe": 250 * 1000 * 1000,
};

export function getProgram(ns: NS, name: string): void {
  ns.singularity.purchaseTor();
  if (
    ns.scan("home").includes("darkweb") &&
    ns.getPlayer().money >= programs[name] &&
    !ns.fileExists(name, "home")
  ) {
    ns.singularity.purchaseProgram(name);
  }
}

export function nukeHosts(ns: NS, hosts: Iterable<string>): void {
  const haveSsh = ns.fileExists("BruteSSH.exe", "home");
  const haveFtp = ns.fileExists("FTPCrack.exe", "home");
  const haveSmtp = ns.fileExists("relaySMTP.exe", "home");
  const haveHttp = ns.fileExists("HTTPWorm.exe", "home");
  const haveSql = ns.fileExists("SQLInject.exe", "home");

  const count = [haveSsh, haveFtp, haveSmtp, haveHttp, haveSql].reduce(
    (s, x) => s + (x ? 1 : 0),
    0
  );

  for (const host of hosts) {
    if (host === "home") continue;
    if (ns.getServerNumPortsRequired(host) > count) {
      continue;
    }
    if (!ns.hasRootAccess(host)) {
      ns.tprint("nuking " + host);
      if (haveSsh) ns.brutessh(host);
      if (haveFtp) ns.ftpcrack(host);
      if (haveSmtp) ns.relaysmtp(host);
      if (haveHttp) ns.httpworm(host);
      if (haveSql) ns.sqlinject(host);
      ns.nuke(host);
    }
  }
}

export function sum(array: number[]): number {
  return array.reduce((s, x) => s + x, 0);
}

export function sumValues(obj: { [index: string]: number }): number {
  return [...Object.values(obj)].reduce((x, y) => x + y, 0);
}

/**
 * @param {NS} ns
 * @param {string} host
 * @param {string[]} exclude
 * @returns {number}
 **/
export function ramUsedByOthers(
  ns: NS,
  host: string,
  exclude: string[]
): number {
  let result = 0;
  for (const program of ns.ps(host)) {
    if (exclude.includes(program.filename)) continue;
    result += program.threads * ns.getScriptRam(program.filename, host);
  }
  return result;
}

/**
 * @param {number} n
 */
export function format(n: number): string {
  const suffixes = [" ", "k", "M", "b", "T", "q"];
  const order =
    n === 0 ? 0 : Math.min(5, Math.floor(Math.log(n) / Math.log(1000)));
  return `${(n / 1000 ** order).toFixed(3)}${suffixes[order]}`;
}
