import { describe, expect, it } from 'vitest';
import { ConcreteState, DerivedBoolean, MutableBoolean, PartialState, World } from '../ts/state';

type CleanUpSystem = {
    lever1: MutableBoolean;
    lever2: MutableBoolean;
    doorA: DerivedBoolean;
    doorB: DerivedBoolean;
    doorC: DerivedBoolean;
    world: World;
};

function createWorld(): CleanUpSystem {
    const lever1 = new MutableBoolean('lever1', true);
    const lever2 = new MutableBoolean('lever2', false);
    const doorA = new DerivedBoolean('doorAOpen', [lever1], (state) => {
        return state.get(lever1);
    });
    const doorB = new DerivedBoolean('doorBOpen', [lever1, lever2], (state) => {
        return !state.get(lever1) && !state.get(lever2);
    });
    const doorC = new DerivedBoolean('doorCOpen', [lever2], (state) => state.get(lever2));

    const world = new World([lever1, lever2, doorA, doorB, doorC]);

    return {
        lever1,
        lever2,
        doorA,
        doorB,
        doorC,
        world,
    };
}

describe('CleanUp PartialState', () => {
    it('finds consistency', () => {
        const { lever1, lever2, doorA, doorB, doorC, world } = createWorld();
        const state = new PartialState(
            world,
            new ConcreteState([
                [doorA, true],
                [lever1, true],
                [lever2, true],
            ]),
        );
        expect(state.isDefaultContradictory()).toBe(false);
        const consistent = state.findConsistentState();
        expect(consistent).toBeTruthy();
    });

    it('finds inconsistency', () => {
        const { lever1, lever2, doorA, doorB, doorC, world } = createWorld();
        const state = new PartialState(
            world,
            new ConcreteState([
                [doorA, true],
                [lever1, false],
                [lever2, true],
            ]),
        );
        expect(state.isDefaultContradictory()).toBe(true);
        const consistent = state.findConsistentState();
        expect(consistent).toBeFalsy();
    });
});

describe('CleanUp World', () => {
    it('has a non-trivial solution', () => {
        const { lever1, lever2, doorA, doorB, doorC, world: system } = createWorld();

        expect(system.get(doorA)).toBe(true);
        expect(system.travelTo(-1)).toBe(true);
        system.set(lever1, false);
        expect(system.get(doorB)).toBe(true);
        system.set(lever2, true);
        expect(system.get(doorC)).toBe(true);
        // Confirm we can't travel without setting L1=T
        expect(system.canTravelTo(0)).toBe(false);
        system.set(lever1, true);
        expect(system.travelTo(0)).toBe(true);
        expect(system.get(doorC)).toBe(true);
    });
});
