import { format, hackableHosts, potentialValue, targetValue } from "./lib";

function selectTargets(ns: NS) {
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
  const targets = sorted.slice(0, 12);
  const bestCurrent = hosts
    .filter((host) => host !== "n00dles")
    .sort((x, y) => -(targetValue(ns, x) - targetValue(ns, y)))[0];
  if (!targets.includes(bestCurrent)) targets[11] = bestCurrent;
  return targets;
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.tail();
  while (true) {
    const hackable = selectTargets(ns);

    ns.clearLog();
    ns.print("==== STATUS ====");
    for (const host of hackable.sort(
      (x, y) => ns.getServerMaxMoney(x) - ns.getServerMaxMoney(y)
    )) {
      ns.printf(
        "%-18s %5.1f / %5.1f  %8s / %8s",
        host,
        ns.getServerSecurityLevel(host),
        ns.getServerMinSecurityLevel(host),
        format(ns.getServerMoneyAvailable(host)),
        format(ns.getServerMaxMoney(host))
      );
    }
    await ns.sleep(5000);
  }
}
