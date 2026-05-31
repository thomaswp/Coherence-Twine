import { describe, expect, it } from 'vitest';
import { DerivedVariable, MutableVariable, World } from '../ts/state';

type MiddleTimeSystem = {
    lever1: MutableVariable;
    lever2: MutableVariable;
    lever3: MutableVariable;
    doorA: DerivedVariable;
    doorB: DerivedVariable;
    doorC: DerivedVariable;
    doorD: DerivedVariable;
    doorE: DerivedVariable;
    world: World;
};

export function createMiddleTimeWorld(): MiddleTimeSystem {
    const lever1 = new MutableVariable('lever1', false);
    const lever2 = new MutableVariable('lever2', false);
    const lever3 = new MutableVariable('lever3', false);

    const doorA = new DerivedVariable('doorAOpen', [lever1], (state) => !state.get(lever1));
    const doorB = new DerivedVariable('doorBOpen', [lever1], (state) => state.get(lever1));
    const doorC = new DerivedVariable('doorCOpen', [lever3], (state) => state.get(lever3));
    const doorD = new DerivedVariable(
        'doorDOpen',
        [lever2, lever3],
        (state) => state.get(lever3) || !state.get(lever2),
    );
    const doorE = new DerivedVariable('doorEOpen', [lever2], (state) => state.get(lever2));

    const world = new World([lever1, lever2, lever3, doorA, doorB, doorC, doorD, doorE]);

    return {
        lever1,
        lever2,
        lever3,
        doorA,
        doorB,
        doorC,
        doorD,
        doorE,
        world,
    };
}

describe('Middle Time World', () => {
    it('has a solution', () => {
        const { lever1, lever2, lever3, doorA, doorB, doorC, doorD, doorE, world } =
            createMiddleTimeWorld();

        expect(world.get(doorA)).toBe(true);

        expect(world.travelTo(-1)).toBe(true);
        // Have to observe D open at T-1 for it to trigger reconciliation
        // TODO: This makes sense, in the sense that there are other ways
        // to make D open at T-1, but in practice those doors are closed
        // so it _should_ still trigger reconciliation, but there's no way
        // for the engine to know that without a sense of what variables can be modified when.
        expect(world.get(doorD)).toBe(true);

        expect(world.travelTo(-2)).toBe(true);

        world.set(lever1, true);
        expect(world.get(doorB)).toBe(true);
        world.set(lever2, true);

        // Can't go home yet; contradiction
        expect(world.canTravelTo(0)).toBe(false);
        expect(world.travelTo(-1)).toBe(true);

        // TODO: Need to implement state transfer to middle times
        expect(world.peek(lever3)).toBe(true);
        expect(world.get(doorC)).toBe(true);

        world.set(lever1, false);
        expect(world.travelTo(0)).toBe(true);
        expect(world.peek(doorD)).toBe(true);
        expect(world.get(doorD)).toBe(true);
        expect(world.get(doorE)).toBe(true);
    });
});
