import { describe, it, expect } from 'vitest'
import { System, Observation, MutableVariable, DerivedVariable } from '../ts/state'

type BooleanSystem = {
    lever1: MutableVariable;
    lever2: MutableVariable;
    doorB: DerivedVariable;
    doorC: DerivedVariable;
    system: System;
}

function createTestSystem(): BooleanSystem {
    
    const lever1 = new MutableVariable('lever1Locked', false);
    const lever2 = new MutableVariable('lever2Locked', true);
    const doorB = new DerivedVariable('labBLocked', (state) => {
        return state.get(lever1) && state.get(lever2);
    });
    const doorC = new DerivedVariable('labCLocked', 
        (state) => state.get(lever2));

    
    const system = new System([
        lever1, lever2, doorB, doorC
    ]);

    return {
        lever1,
        lever2,
        doorB,
        doorC,
        system
    }
}


describe('system', () => {
    it('has a solution', () => {
        const {
            lever1, lever2,
            doorB, doorC,
            system
        } = createTestSystem();
        expect(!system.get(doorB));
        expect(system.travel(-1));
        system.set(lever1, false);
        expect(system.travel(0));
        expect(!system.get(doorC));
    })
})