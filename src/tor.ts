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

export async function main(ns: NS): Promise<void> {
  while (Object.keys(programs).some((program) => !ns.fileExists(program))) {
    if (!ns.scan().includes("darkweb") && ns.getPlayer().money >= 250 * 1000) {
      ns.singularity.purchaseTor();
    }
    for (const [program, cost] of Object.entries(programs)) {
      if (!ns.fileExists(program) && ns.getPlayer().money >= cost)
        ns.singularity.purchaseProgram(program);
    }
    await ns.sleep(1000);
  }
}
