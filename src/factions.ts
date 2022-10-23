import { canHack, connectTo } from "./lib";

const backdoorHosts = [
  ["CSEC", "CyberSec"],
  ["avmnite-02h", "NiteSec"],
  ["I.I.I.I", "The Black Hand"],
  ["run4theh111z", "BitRunners"],
];

const cityFactions = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];

const desiredFactions = ["Tian Di Hui", ...backdoorHosts.map(([, faction]) => faction)];

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.tail();

  if (
    ns.getPlayer().money >= 200 * 1000 &&
    !ns.getPlayer().factions.includes("Tian Di Hui") &&
    !["Chongqing", "New Tokyo", "Ishima"].includes(ns.getPlayer().city)
  ) {
    // Make sure we have access to Tian Di Hui
    ns.singularity.travelToCity("Chongqing");
  }
  while (!desiredFactions.every((faction) => ns.getPlayer().factions.includes(faction))) {
    for (const faction of ns.singularity
      .checkFactionInvitations()
      .filter((faction) => !cityFactions.includes(faction))) {
      ns.singularity.joinFaction(faction);
    }
    for (const [host, faction] of backdoorHosts) {
      if (
        !ns.getPlayer().factions.includes(faction) &&
        canHack(ns, host) &&
        !ns.getServer(host).backdoorInstalled
      ) {
        if (!connectTo(ns, host)) throw `Failed to connect to ${host}.`;
        ns.tprint(`backdooring ${host} for access to ${faction}`);
        await ns.singularity.installBackdoor();
        connectTo(ns, "home", host);
      }
    }
    await ns.sleep(1000);
  }
}
