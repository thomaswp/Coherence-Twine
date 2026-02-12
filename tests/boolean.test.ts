import { describe, expect, it } from 'vitest';
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
