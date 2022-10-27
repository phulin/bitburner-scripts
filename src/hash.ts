enum UpgradeType {
  LEVEL,
  RAM,
  CORES,
}

function delta(
  ns: NS,
  i: number,
  { level, ram, cores }: { level: number; ram: number; cores: number }
) {
  const stats = ns.hacknet.getNodeStats(i);
  const base = ns.formulas.hacknetServers.hashGainRate(
    stats.level,
    stats.ramUsed ?? 0,
    stats.ram,
    stats.cores
  );
  const improved = ns.formulas.hacknetServers.hashGainRate(
    stats.level + (level ?? 0),
    stats.ramUsed ?? 0,
    stats.ram + (ram ?? 0),
    stats.cores + (cores ?? 0)
  );
  return improved - base;
}

function improvementCost(ns: NS, i: number, type: UpgradeType) {
  return type === UpgradeType.LEVEL
    ? ns.hacknet.getLevelUpgradeCost(i, 1)
    : type === UpgradeType.RAM
    ? ns.hacknet.getRamUpgradeCost(i, 1)
    : ns.hacknet.getCoreUpgradeCost(i, 1);
}

function improvementValue(ns: NS, i: number, type: UpgradeType) {
  const stats = ns.hacknet.getNodeStats(i);
  return (
    delta(ns, i, {
      level: type === UpgradeType.LEVEL ? 1 : 0,
      ram: type === UpgradeType.RAM ? stats.ram : 0,
      cores: type === UpgradeType.CORES ? 1 : 0,
    }) / improvementCost(ns, i, type)
  );
}

function improve(ns: NS, i: number, type: number) {
  if (type === UpgradeType.LEVEL) {
    return ns.hacknet.upgradeLevel(i, 1);
  } else if (type === UpgradeType.RAM) {
    return ns.hacknet.upgradeRam(i, 1);
  } else {
    return ns.hacknet.upgradeCore(i, 1);
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("sleep");
  while (true) {
    ns.print(`${ns.hacknet.numHashes().toFixed(3)} hashes`);
    const goal = ns.args.includes("study")
      ? "Improve Studying"
      : ns.args.includes("weaken")
      ? ns.hacknet.hashCost("Reduce Minimum Security") <
        ns.hacknet.hashCost("Increase Maximum Money")
        ? "Reduce Minimum Security"
        : "Increase Maximum Money"
      : "Sell for Money";

    const cost = ns.hacknet.hashCost(goal);
    while (ns.hacknet.hashCapacity() < cost) {
      if (!ns.hacknet.upgradeCache(0, 1)) break;
    }
    while (ns.hacknet.numHashes() > cost && typeof ns.args[1] === "string") {
      if (!ns.hacknet.spendHashes(goal, ns.args[1])) break;
    }
    if (ns.args.includes("nobuy")) {
      await ns.sleep(1000);
      continue;
    }
    while (
      ns.getPlayer().money > ns.hacknet.getPurchaseNodeCost() &&
      ns.hacknet.numNodes() < ns.hacknet.maxNumNodes()
    ) {
      ns.hacknet.purchaseNode();
    }
    while (true) {
      const nodes = ns.hacknet.numNodes();
      const nodeList = [...new Array(nodes).keys()];
      const allImprovements = nodeList.map((i) => [0, 1, 2].map((type) => ({ i, type }))).flat(1);
      allImprovements.sort(
        (x, y) => -(improvementValue(ns, x.i, x.type) - improvementValue(ns, y.i, y.type))
      );
      if (
        improvementCost(ns, allImprovements[0].i, allImprovements[0].type) > ns.getPlayer().money
      ) {
        break;
      }
      while (
        (nodeList.length <= 1 ||
          improvementValue(ns, allImprovements[0].i, allImprovements[0].type) >=
            improvementValue(ns, allImprovements[1].i, allImprovements[1].type)) &&
        improvementCost(ns, allImprovements[0].i, allImprovements[0].type) <= ns.getPlayer().money
      ) {
        const { i, type } = allImprovements[0];
        ns.print(`upgrading ${i} ${type}`);
        improve(ns, i, type);
      }
      await ns.sleep(1);
    }
    await ns.sleep(1000);
  }
}
