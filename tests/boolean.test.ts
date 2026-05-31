import { assert, describe, expect, it } from 'vitest';
import { createBooleanWorld } from '../ts/level/levels/boolean';
import { PartialState, Variable } from '../ts/state';

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
        assert.exists(consistent);
        console.log(consistent.inspect());
        expect(consistent.getObservedValues().get(lever2)).toBe(true);
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

    it('Keeps player in past until contradictions are resolved', () => {
        const { lever1, lever2, doorC, doorB, world: system } = createBooleanWorld();
        expect(system.get(doorC)).toBe(true);
        expect(system.travelTo(-1)).toBe(true);
        system.set(lever1, false);
        expect(system.get(doorB)).toBe(false); // Forces L2=Off
        // Cannot travel to 0, because we've observed that L1=Off, L2=Off
        // So C cannot be Open
        expect(system.travelTo(0)).toBe(false);
        // We have to set L1=On again to be able to travel, which we can do
        system.set(lever1, true);
        expect(system.travelTo(0)).toBe(true);
        // But this shuts us out of a solution
        expect(system.get(doorB)).toBe(false);
        // L2 should be forced off in resolution
        expect(system.peek(lever2)).toBe(false);
    });
});
