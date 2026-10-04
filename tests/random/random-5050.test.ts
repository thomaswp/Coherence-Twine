import { assert, describe, expect, it } from 'vitest';
import {
    DerivedBoolean,
    MutableBoolean,
    MutableNumeric,
    TriggeredBoolean,
    World,
} from '../../ts/state';

function createWorld(seed: number) {
    const nValues = 3;

    assert(seed >= 0 && seed < nValues, `Seed must be between 0 and ${nValues - 1}`);

    const button1 = new MutableBoolean('button1', false, true);

    const randomDoor = new MutableNumeric('randomDoor', seed, nValues - 1);

    const doors = Array.from(
        { length: nValues },
        (_, i) =>
            new DerivedBoolean(
                `door${i}Open`,
                [button1, randomDoor],
                (state) => state.get(button1) && state.get(randomDoor) === i,
            ),
    );
    const [doorA, doorB, doorC] = doors;

    const robotGoal = new TriggeredBoolean(
        'robotAtGoal',
        [button1, doorA, doorB],
        (state) => state.get(button1) && (state.get(doorA) || state.get(doorB)),
        true,
    );

    const world = new World([button1, randomDoor, ...doors, robotGoal]);

    return {
        button1,
        randomDoor,
        doorA,
        doorB,
        doorC,
        robotGoal,
        world,
    };
}

describe('Random 50/50 World', () => {
    it('has a solution for all seeds', () => {
        for (let seed = 0; seed < 3; seed++) {
            console.log(`=== testing for seed ${seed} ===`);
            const { button1, randomDoor, doorA, doorB, doorC, robotGoal, world } =
                createWorld(seed);

            // Initially, all doors are closed
            expect(world.peek(doorA)).toBe(false);
            expect(world.peek(doorB)).toBe(false);
            expect(world.peek(doorC)).toBe(false);

            // Observe that the robot is not at the goal
            expect(world.get(robotGoal)).toBe(false);

            expect(world.travelTo(-1)).toBe(true);

            // Irreversible action forces past and present to
            // reconcile.
            world.set(button1, true);

            // Regardless of seed, doorC must open
            expect(world.get(doorC)).toBe(true);

            // Goal!

            // The rest of the state is as we left it
            expect(world.get(doorA)).toBe(false);
            expect(world.get(doorB)).toBe(false);
            expect(world.get(robotGoal)).toBe(false);
        }
    });
});
