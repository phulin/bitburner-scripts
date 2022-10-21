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

async function watch(ns: NS) {
  while (true) {
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
