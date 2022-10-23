import { format } from "./lib";

function augment(ns: NS) {
  for (const equip of ns.gang.getEquipmentNames()) {
    ns.tprint(`${equip} $${format(ns.gang.getEquipmentCost(equip))}`);
  }
  for (const member of ns.gang.getMemberNames()) {
    for (const equip of ns.gang.getEquipmentNames()) {
      const stats = ns.gang.getEquipmentStats(equip);
      if (
        ns.gang.getEquipmentType(equip) === "Augmentation" &&
        ((stats.str ?? 0) > 0 ||
          (stats.def ?? 0) > 0 ||
          (stats.dex ?? 0) > 0 ||
          (stats.agi ?? 0) > 0)
      ) {
        ns.gang.purchaseEquipment(member, equip);
      }
    }
  }
}

function equip(ns: NS) {
  for (const member of ns.gang.getMemberNames()) {
    for (const equip of ns.gang.getEquipmentNames()) {
      const stats = ns.gang.getEquipmentStats(equip);
      if (
        ns.gang.getEquipmentType(equip) !== "Augmentation" &&
        !ns.gang.getMemberInformation(member).upgrades.includes(equip) &&
        ((stats.str ?? 0) > 0 ||
          (stats.def ?? 0) > 0 ||
          (stats.dex ?? 0) > 0 ||
          (stats.agi ?? 0) > 0)
      ) {
        ns.gang.purchaseEquipment(member, equip);
      }
    }
  }
}

function ascend(ns: NS) {
  const goodAugments = ns.gang.getEquipmentNames().filter((equip) => {
    const stats = ns.gang.getEquipmentStats(equip);
    return (
      ns.gang.getEquipmentType(equip) === "Augmentation" &&
      ((stats.str ?? 0) > 0 || (stats.def ?? 0) > 0 || (stats.dex ?? 0) > 0 || (stats.agi ?? 0) > 0)
    );
  });
  for (const member of ns.gang.getMemberNames()) {
    const info = ns.gang.getMemberInformation(member);
    if (
      goodAugments.every((augment) => info.augmentations.includes(augment)) &&
      info.task === "Train Combat" &&
      info.earnedRespect < 0.01 * ns.gang.getGangInformation().respect
    ) {
      const strAscensionPointGain = ns.formulas.gang.ascensionPointsGain(info.str_exp);
      const newStrMultiplier = ns.formulas.gang.ascensionMultiplier(
        info.str_asc_points + strAscensionPointGain
      );
      if (newStrMultiplier - info.str_asc_mult > 2) {
        ns.gang.ascendMember(member);
      }
    }
  }
}

async function watch(ns: NS) {
  while (true) {
    ascend(ns);
    equip(ns);
    await ns.sleep(2000);
  }
}

export async function main(ns: NS): Promise<void> {
  const [command, ...rest] = ns.args;
  if (command === "switch") {
    for (const task of ns.gang.getTaskNames()) {
      const desired = rest.join(" ").toLowerCase();
      if (
        task.toLowerCase().startsWith(desired) ||
        (task.startsWith("Train ") && task.toLowerCase().slice(6).startsWith(desired))
      ) {
        for (const member of ns.gang.getMemberNames()) {
          ns.gang.setMemberTask(member, task);
        }
      }
    }
  } else if (command === "equip") {
    equip(ns);
  } else if (command === "augment") {
    augment(ns);
  } else if (command === "watch") {
    await watch(ns);
  }
}
