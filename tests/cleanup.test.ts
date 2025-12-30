import { describe, it, expect } from 'vitest'
import { World, MutableVariable, DerivedVariable, PartialState, Variable } from '../ts/state'

type CleanUpSystem = {
    lever1: MutableVariable;
    lever2: MutableVariable;
    doorA: DerivedVariable;
    doorB: DerivedVariable;
    doorC: DerivedVariable;
    world: World;
}

function createWorld(): CleanUpSystem {
    
    const lever1 = new MutableVariable('lever1', true);
    const lever2 = new MutableVariable('lever2', false);
    const doorA = new DerivedVariable('doorAOpen', [
        lever1
    ], (state) => {
        return state.get(lever1);
    });
    const doorB = new DerivedVariable('doorBOpen', [
            lever1, lever2
        ], (state) => {
            return !state.get(lever1) && !state.get(lever2);
        }
    );
    const doorC = new DerivedVariable('doorCOpen', 
        [lever2],
        (state) => state.get(lever2));

    
    const world = new World([
        lever1, lever2, doorA, doorB, doorC
    ]);

    return {
        lever1,
        lever2,
        doorA,
        doorB,
        doorC,
        world
    }
}

describe('CleanUp PartialState', () => {
    it('finds consistency', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            world
        } = createWorld();
        const state = new PartialState(
            world,
            new Map<Variable, boolean>([
                [doorA, true],
                [lever1, true],
                [lever2, true],
            ]));
        expect(state.isDefaultContradictory()).toBe(false);
        const consistent = state.findConsistentState();
        expect(consistent).toBeTruthy();
    });

    it('finds inconsistency', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            world
        } = createWorld();
        const state = new PartialState(
            world,
            new Map<Variable, boolean>([
                [doorA, true],
                [lever1, false],
                [lever2, true],
            ]));
        expect(state.isDefaultContradictory()).toBe(true);
        const consistent = state.findConsistentState();
        expect(consistent).toBeFalsy();
    });
})

describe('CleanUp World', () => {

    it('has a non-trivial solution', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            world: system
        } = createWorld();

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
})