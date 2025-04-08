import { world, EquipmentSlot, EntityEquippableComponent, system, ItemDurabilityComponent, GameMode, ItemEnchantableComponent } from '@minecraft/server';

class BlockManager {
    static destroyBlock(dimension, location) {
        dimension.runCommand(`setblock ${location.x} ${location.y} ${location.z} air destroy`);
    }

    static getBlocksAround(block) {
        let above = undefined;
        try {
            above = block.above(1);
        } catch { }
        let below = undefined;
        try {
            below = block.below(1);
        } catch { }
        let north = undefined;
        try {
            north = block.north(1);
        } catch { }
        let south = undefined;
        try {
            south = block.south(1);
        } catch { }
        let east = undefined;
        try {
            east = block.east(1);
        } catch { }
        let west = undefined;
        try {
            west = block.west(1);
        } catch { }
        return [
            above, below, north, south, east, west
        ];
    }

    static break(block, silkTouched, breakSpeed) {
        let typeId = block.typeId;
        if (typeId.includes("lit_")) {
            typeId = typeId.replace("lit_", "");
        }

        const center = block.center();
        system.runTimeout(() => {
            if (silkTouched) {
                const lastRule = world.gameRules.doTileDrops;
                world.gameRules.doTileDrops = false;
                BlockManager.destroyBlock(block.dimension, block.location);
                world.gameRules.doTileDrops = lastRule;
                const item = new ItemStack(typeId, 1);
                // @ts-ignore
                const itemEntity = block.dimension.spawnItem(item, center);
                itemEntity?.applyImpulse({
                    x: randomNum(-0.1, 0.1),
                    y: randomNum(0.1, 0.25),
                    z: randomNum(-0.1, 0.1),
                });
            } else {
                BlockManager.destroyBlock(block.dimension, block.location);
            }
        }, breakSpeed);
    }
}

class ItemManager {
    static reduceDurability(unbreakingLevel) {
        if (unbreakingLevel != undefined) {
            const chance = 100 / (unbreakingLevel + 1);
            const rand = Math.random() * 100;
            if (rand <= chance) {
                return true;
            }
        } else {
            return true;
        }
    }
}

class TreeHarvesterManager {
    static logIDs = [
        "minecraft:oak_log",
        "minecraft:spruce_log",
        "minecraft:birch_log",
        "minecraft:jungle_log",
        "minecraft:dark_oak_log",
        "minecraft:acacia_log",
        "minecraft:mangrove_log",
        "minecraft:mangrove_roots",
        "minecraft:cherry_log",
        "minecraft:pale_oak_log"
    ];

    static leafIDs = [
        "minecraft:oak_leaves",
        "minecraft:spruce_leaves",
        "minecraft:birch_leaves",
        "minecraft:jungle_leaves",
        "minecraft:dark_oak_leaves",
        "minecraft:acacia_leaves",
        "minecraft:mangrove_leaves",
        "minecraft:azalea_leaves",
        "minecraft:azalea_leaves_flowered",
        "minecraft:cherry_leaves",
        "minecraft:pale_oak_leaves"
    ];

    static netherLogIDs = [
        "minecraft:nether_wart_block",
        "minecraft:warped_wart_block"
    ];

    static netherLeafIDs = [
        "minecraft:crimson_stem",
        "minecraft:warped_stem"
    ];

    static limit = 256;
    static breakSpeed = 2; // Min: 1; Max: 50; Time in milliseconds between each block break; Recommended Min: 2; Max: 10 (the higher the number, the longer it will take to break)
    static customLogsAndLeaves = true; // Enable (true) or disable (false) support for custom blocks
    static enableNetherTrees = true; // Enable (true) or disable (false) support for Nether blocks

    static start(player, brokenBlock, item, mainhand) {
        const durComp = item.getComponent(ItemDurabilityComponent.componentId);
        if (!durComp) return;

        const enchComp = item.getComponent(ItemEnchantableComponent.componentId);
        let unbreakingLevel = undefined;
        let silkTouched = false;

        if (enchComp) {
            if (enchComp.hasEnchantment("unbreaking")) {
                unbreakingLevel = enchComp.getEnchantment("unbreaking").level;
            }
            if (enchComp.hasEnchantment("silk_touch")) {
                silkTouched = true;
            }
        }

        const blocks = BlockManager.getBlocksAround(brokenBlock);
        const below = blocks[1];
        if (below && below.typeId !== "minecraft:air") {
            if (TreeHarvesterManager.logIDs.includes(brokenBlock.typeId) || TreeHarvesterManager.leafIDs.includes(brokenBlock.typeId) ||
                (TreeHarvesterManager.customLogsAndLeaves === true && (brokenBlock.typeId.includes("_log") || brokenBlock.typeId.includes("_leaves"))) ||
                (TreeHarvesterManager.enableNetherTrees === true && (TreeHarvesterManager.netherLogIDs.includes(brokenBlock.typeId) || TreeHarvesterManager.netherLeafIDs.includes(brokenBlock.typeId)))) {
                TreeHarvesterManager.getBlocks(brokenBlock, player, item, mainhand, durComp, unbreakingLevel, silkTouched);
            }
        }
    }

    static getBlocks(block, source, item, mainhand, durComp, unbreakingLevel, silkTouched) {
        let durability = durComp.damage;
        let blockNum = 0;
        let stop = false;
        const deniedLocs = [];

        const tick = (block, takeDur, breakBlock) => {
            if (blockNum >= TreeHarvesterManager.limit || stop) return;
            if (deniedLocs.some(loc => loc.x === block.location.x && loc.y === block.location.y && loc.z === block.location.z)) return;

            deniedLocs.push(block.location);

            const blocks = BlockManager.getBlocksAround(block);

            if (breakBlock) {
                BlockManager.break(block, silkTouched, TreeHarvesterManager.breakSpeed);
                blockNum++;
            }

            if (takeDur && ItemManager.reduceDurability(unbreakingLevel)) {
                durability++;
                if (durability >= durComp.maxDurability) {
                    stop = true;
                    system.runTimeout(() => {
                        source.dimension.playSound("random.break", source.location);
                        mainhand.setItem(undefined);
                    }, TreeHarvesterManager.breakSpeed);
                    return;
                }
            }

            blocks.forEach(newblock => {
                if (newblock &&
                    (TreeHarvesterManager.logIDs.includes(newblock.typeId) || TreeHarvesterManager.leafIDs.includes(newblock.typeId) ||
                        (TreeHarvesterManager.customLogsAndLeaves === true && (newblock.typeId.includes("_log") || newblock.typeId.includes("_leaves"))) ||
                        (TreeHarvesterManager.enableNetherTrees === true && (TreeHarvesterManager.netherLogIDs.includes(newblock.typeId)) || TreeHarvesterManager.netherLeafIDs.includes(newblock.typeId)))) {
                    system.runTimeout(() => {
                        tick(newblock, true, true);
                    }, TreeHarvesterManager.breakSpeed);
                }
            });

            if (durability < durComp.maxDurability) {
                system.runTimeout(() => {
                    durComp.damage = durability;
                    mainhand.setItem(item);
                }, TreeHarvesterManager.breakSpeed);
            }
        };

        tick(block, true, true);
    }

    static isDenied(blockLoc, deniedList) {
        return deniedList.some(loc => loc.x === blockLoc.x && loc.y === blockLoc.y && loc.z === blockLoc.z);
    }
}

world.beforeEvents.playerBreakBlock.subscribe((data) => {
    const { block, itemStack, player } = data;

    if (!itemStack) return;

    const mainhand = player.getComponent(EntityEquippableComponent.componentId).getEquipmentSlot(EquipmentSlot.Mainhand);

    const item = mainhand.getItem();

    if (!item) return;

    if (!player.isSneaking) return;

    if (!item.typeId.includes("_axe")) return;

    TreeHarvesterManager.start(player, block, item, mainhand);
});

function randomNum(min, max) {
    return Math.random() * (max - min) + min;
}
