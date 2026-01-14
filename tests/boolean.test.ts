import { describe, expect, it } from 'vitest';
import { DerivedVariable, MutableVariable, PartialState, Variable, World } from '../ts/state';

type BooleanSystem = {
    lever1: MutableVariable;
    lever2: MutableVariable;
    doorC: DerivedVariable;
    doorB: DerivedVariable;
    world: World;
};

function createBooleanWorld(): BooleanSystem {
    const lever1 = new MutableVariable('lever1', true);
    const lever2 = new MutableVariable('lever2', false);
    const doorB = new DerivedVariable('labBOpen', [lever2], (state) => state.get(lever2));
    const doorC = new DerivedVariable('labCOpen', [lever1, lever2], (state) => {
        return state.get(lever1) || state.get(lever2);
    });

    const world = new World([lever1, lever2, doorC, doorB]);

    return {
        lever1,
        lever2,
        doorB,
        doorC,
        world,
    };
}

describe('PartialState', () => {
    it('finds consistency', () => {
        const { lever1, lever2, doorC: doorB, doorB: doorC, world } = createBooleanWorld();
        const state = new PartialState(
            world,
            new Map<Variable, boolean>([
                [lever1, false],
                [doorC, true],
            ]),
        );
        expect(state.isDefaultContradictory()).toBe(true);
        const consistent = state.findConsistentState();
        expect(consistent).toBeTruthy();
        console.log(consistent.inspect());
        expect(consistent.observedValues.get(lever2)).toBe(true);
    });
});

describe('Boolean World', () => {
    it('carries state forward', () => {
        const { lever1, lever2, doorC, doorB, world: system } = createBooleanWorld();

        expect(system.travelTo(-1)).toBe(true);
        system.set(lever1, false);
        expect(system.travelTo(0)).toBe(true);
        expect(system.get(doorC)).toBe(false);
        expect(system.get(lever1)).toBe(false);
    });

    it('has a solution', () => {
        const { lever1, lever2, doorC, doorB, world: system } = createBooleanWorld();
        expect(system.get(doorC)).toBe(true);
        expect(system.travelTo(-1)).toBe(true);
        system.set(lever1, false);
        expect(system.travelTo(0)).toBe(true);
        expect(system.get(doorB)).toBe(true);
    });

    it('does not have a simple solution', () => {
        const { lever1, lever2, doorB, world: system } = createBooleanWorld();
        expect(system.travelTo(-1)).toBe(true);
        system.set(lever1, false);
        expect(system.travelTo(0)).toBe(true);
        expect(system.get(doorB)).toBe(false);
    });

    it('brooks no contradictions', () => {
        const { lever1, lever2, doorC, doorB, world: system } = createBooleanWorld();
        expect(system.get(doorB)).toBe(false);
        expect(system.get(doorC)).toBe(true);
        expect(system.travelTo(-1)).toBe(true);
        expect(system.get(lever1)).toBe(true);
        expect(system.canTravelTo(0)).toBe(true);
        system.set(lever1, false);
        expect(system.travelTo(0)).toBe(false);
        system.set(lever1, true);
        expect(system.travelTo(0)).toBe(true);
    });

    it('brooks not even a simple one', () => {
        const { lever1, lever2, doorC, doorB, world: system } = createBooleanWorld();
        expect(system.get(lever1)).toBe(true);
        expect(system.travelTo(-1)).toBe(true);
        system.set(lever1, false);
        expect(system.travelTo(0)).toBe(false);
        system.set(lever1, true);
        expect(system.travelTo(0)).toBe(true);
    });
});
