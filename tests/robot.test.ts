import { describe, it, expect } from 'vitest'
import { World, MutableVariable, DerivedVariable, PartialState, Variable, TriggeredVariable } from '../ts/state'

type RobotSystem = {
    lever1: MutableVariable;
    lever2: MutableVariable;
    doorA: DerivedVariable;
    doorB: DerivedVariable;
    doorC: TriggeredVariable;
    world: World;
}

function createRobotWorld(): RobotSystem {
    
    const lever1 = new MutableVariable('lever1', true);
    const lever2 = new MutableVariable('lever2', false);
    const doorA = new DerivedVariable('doorAOpen',
        [lever1],
        (state) => !state.get(lever1)
    );
    const doorB = new DerivedVariable('doorBOpen',
        [lever1, lever2],
        (state) => state.get(lever1) && state.get(lever2)
    );
    const doorC = new TriggeredVariable('doorCOpen', [
            doorA,
        ], (state) => {
            return state.get(doorA);
        }
    );

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

describe('PartialState', () => {
    it('follows triggers', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            world
        } = createRobotWorld();
        const state = new PartialState(
            world,
            new Map<Variable, boolean>([
                // Should work with only the lever's state
                // since the door is derived from it
                [lever1, false],
            ]));
        expect(state.isDefaultContradictory()).toBe(false);
        const consistent = state.findConsistentState();
        expect(consistent).toBeTruthy();
        console.log(consistent.inspect());
        const concreteState = consistent.toConcreteState();
        expect(concreteState.get(doorA)).toBe(true);
        expect(concreteState.get(doorB)).toBe(false);
        expect(concreteState.get(doorC)).toBe(true);
    });

    it('identifies contradictions with triggers', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            world
        } = createRobotWorld();
        const state = new PartialState(
            world,
            new Map<Variable, boolean>([
                // Should open door A, which triggers door C
                [lever1, false],
                // but we say door C is closed, so contradiction
                [doorC, false],
            ]));
        expect(state.isDefaultContradictory()).toBe(true);
        const consistent = state.findConsistentState();
        expect(consistent).toBeFalsy();
    });

    it('true triggers do not force state updates', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            world
        } = createRobotWorld();
        const state = new PartialState(
            world,
            new Map<Variable, boolean>([
                // We know at _some_ point door A was opened, but it
                // may no longer be, so nothing should be forced
                [doorC, true],
            ]));
        expect(state.isDefaultContradictory()).toBe(false);
        const consistent = state.findConsistentState();
        expect(consistent).toBeTruthy();
        const concreteState = consistent.toConcreteState();
        expect(concreteState.get(doorA)).toBe(false);
    });

    it('updates triggers based on state updates', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            world
        } = createRobotWorld();
        const state = new PartialState(
            world,
            new Map<Variable, boolean>([
                // Contradicts default value for L1
                // and should cause door C to open
                [doorA, true],
            ]));
        expect(state.isDefaultContradictory()).toBe(true);
        const consistent = state.findConsistentState();
        expect(consistent).toBeTruthy();
        const concreteState = consistent.toConcreteState();
        expect(concreteState.get(lever1)).toBe(false);
        expect(concreteState.get(doorC)).toBe(true);
    });
})

describe('Robot world', () => {

    it('has a solution', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            world: system
        } = createRobotWorld();
        // Just testing all the doors
        // Since there's no time travel here,
        // we can freely observe all state
        expect(system.get(doorA)).toBe(false);
        expect(system.get(doorB)).toBe(false);
        expect(system.get(doorC)).toBe(false);

        // Open door A by pulling lever 1, which should
        // trigger the robot to open door C
        system.set(lever1, false);
        expect(system.get(doorA)).toBe(true);
        expect(system.get(doorC)).toBe(true);

        // Now we can pull lever 2 to partially open door B
        system.set(lever2, true);

        // We also need to reset L1
        system.set(lever1, true);
        // Which should close door A, without affecting door C
        expect(system.get(doorA)).toBe(false);
        expect(system.get(doorC)).toBe(true);
        
        // Then we can get to the goal
        expect(system.get(doorB)).toBe(true);
    });
})