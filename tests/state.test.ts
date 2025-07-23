import { describe, it, expect } from 'vitest'
import { World, MutableVariable, DerivedVariable, PartialState, Variable } from '../ts/state'

type BooleanSystem = {
    lever1: MutableVariable;
    lever2: MutableVariable;
    doorB: DerivedVariable;
    doorC: DerivedVariable;
    world: World;
}

function createBooleanWorld(): BooleanSystem {
    
    const lever1 = new MutableVariable('lever1Locked', false);
    const lever2 = new MutableVariable('lever2Locked', true);
    const doorB = new DerivedVariable('labBLocked', [
            lever1, lever2
        ], (state) => {
            return state.get(lever1) && state.get(lever2);
        }
    );
    const doorC = new DerivedVariable('labCLocked', 
        [lever2],
        (state) => state.get(lever2));

    
    const world = new World([
        lever1, lever2, doorB, doorC
    ]);

    return {
        lever1,
        lever2,
        doorB,
        doorC,
        world
    }
}

describe('PartialState', () => {
    it('finds consistency', () => {
        const {
            lever1, lever2,
            doorB, doorC,
            world
        } = createBooleanWorld();
        const state = new PartialState(
            [lever1, lever2], 
            [doorB, doorC], 
            new Map<Variable, boolean>([
                [lever1, true],
                [doorC, false]
            ]));
        expect(state.isDefaultContradictory()).toBe(true);
        const consistent = state.findConsistentState();
        expect(consistent).toBeTruthy();
        console.log(consistent.inspect());
        expect(consistent.observedValues.get(lever2)).toBe(false);
    })
})

describe('World', () => {

    it('carries state forward', () => {
        const {
            lever1, lever2,
            doorB, doorC,
            world: system
        } = createBooleanWorld();

        expect(system.travelTo(-1)).toBe(true);
        system.set(lever1, true);
        expect(system.travelTo(0)).toBe(true);
        expect(system.get(doorB)).toBe(true);
        expect(system.get(lever1)).toBe(true);
    })

    it('has a solution', () => {
        const {
            lever1, lever2,
            doorB, doorC,
            world: system
        } = createBooleanWorld();
        expect(system.get(doorB)).toBe(false);
        expect(system.travelTo(-1)).toBe(true);
        system.set(lever1, true);
        expect(system.travelTo(0)).toBe(true);
        expect(system.get(doorC)).toBe(false);
    })
})