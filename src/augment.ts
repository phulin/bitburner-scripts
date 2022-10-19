const factions = [
  "Daedalus",
  "BitRunners",
  "Sector-12",
  "Fulcrum Secret Technologies",
  "Tian Di Hui",
];

function donationRequired(ns: NS, faction: string, targetReputation: number) {
  const reputationNeeded = targetReputation - ns.singularity.getFactionFavor(faction);
  return Math.ceil((reputationNeeded * 10 ** 6) / (ns.singularity.getFactionFavor(faction) / 100));
}

export async function main(ns: NS): Promise<void> {
  const aug = "NeuroFlux Governor";
  for (const faction of factions.sort(
    (x, y) => ns.singularity.getFactionFavor(y) - ns.singularity.getFactionFavor(x)
  )) {
    ns.print(faction);
    do {
      const reputationRequired = ns.singularity.getAugmentationRepReq(aug);
      const donation = Math.max(0, donationRequired(ns, faction, reputationRequired));
      if (
        reputationRequired > ns.singularity.getFactionRep(faction) &&
        ns.singularity.getAugmentationPrice(aug) + donation < ns.getPlayer().money
      ) {
        ns.print(`need ${reputationRequired} rep`);
        ns.singularity.donateToFaction(faction, donationRequired(ns, faction, reputationRequired));
      }
    } while (ns.singularity.purchaseAugmentation(faction, aug));
  }
}
