import { describe, it, expect } from 'vitest'
import { World, MutableVariable, DerivedVariable, PartialState, Variable, TriggeredVariable } from '../ts/state'

function createRobotWorld() {
    
    const lever1 = new MutableVariable('lever1', false);
    const lever2 = new MutableVariable('lever2', true);
    const doorA = new MutableVariable('doorAOpen', false);

    const doorB = new DerivedVariable('doorBOpen',
        [lever2],
        (state) => state.get(lever2)
    );
    const doorC = new DerivedVariable('doorCOpen',
        [lever1],
        (state) => state.get(lever1)
    );
    // const doorD = new DerivedVariable('doorDOpen',
    //     [lever1],
    //     (state) => state.get(lever1)
    // );
    const robotGoal = new TriggeredVariable('robotAtGoal',
        [doorA, doorB, doorC],
        (state) => state.get(doorC) && (state.get(doorA) || state.get(doorB)),
        false
    );

    const world = new World([
        lever1, lever2, doorA, doorB, doorC, robotGoal
    ]);

    return {
        lever1,
        lever2,
        doorA,
        doorB,
        doorC,
        // doorD,
        robotGoal,
        world
    }
}

describe('PartialState', () => {
    
})

describe('Robot Time world', () => {

    it('has a solution', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            robotGoal,
            world: system
        } = createRobotWorld();

        // Testing all the vars and their start state
        expect(system.peek(doorA)).toBe(false);
        expect(system.peek(doorB)).toBe(true);
        expect(system.peek(doorC)).toBe(false);

        // We'd actually observe this
        expect(system.get(robotGoal)).toBe(false);

        // Open door C by pulling lever 1
        system.set(lever1, true);
        expect(system.peek(doorC)).toBe(true);
        // The robot should automatically be observed on the goal
        expect(system.currentPeriod.peekValue(robotGoal)).toBe(true);
        expect(system.get(robotGoal)).toBe(true);

        expect(system.peek(doorA)).toBe(false);

        // Travel back in time to before lever 1 was pulled
        expect(system.travelTo(-1)).toBe(true);

        // Close door B
        system.set(lever2, false);

        // Now we can't travel back to period 0
        expect(system.travelTo(0)).toBe(true);

        // Because the robot got to its goal, but not through door B,
        // door A must have been open the whole time
        expect(system.get(doorA)).toBe(true);        
    });

    it('has a nontrivial solution', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            robotGoal,
            world: system
        } = createRobotWorld();

        // If we make the mistake of observing door A as closed at the start
        // it can't update and we just get a contradiction
        expect(system.get(doorA)).toBe(false);

        // Open door C by pulling lever 1
        system.set(lever1, true);
        expect(system.peek(doorC)).toBe(true);
        // The robot should automatically be observed on the goal
        expect(system.currentPeriod.peekValue(robotGoal)).toBe(true);
        expect(system.get(robotGoal)).toBe(true);

        // Travel back in time to before lever 1 was pulled
        expect(system.travelTo(-1)).toBe(true);

        // Close door B
        system.set(lever2, false);

        // Now we can't travel back to period 0
        // because there's no way for the robot to have reached its goal
        expect(system.travelTo(0)).toBe(false);
    });

    it('doesn\'t persist the robot action', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            robotGoal,
            world: system
        } = createRobotWorld();

        system.travelTo(-1);
        system.set(lever1, true);
        system.set(lever1, false);

        // The robot reached it goal even though
        // we reset lever1
        expect(system.get(robotGoal)).toBe(true);


        expect(system.travelTo(0)).toBe(true);
        expect(system.get(robotGoal)).toBe(false);

        expect(system.peek(doorA)).toBe(false);
        expect(system.peek(doorB)).toBe(true);
        expect(system.peek(doorC)).toBe(false);
    });

    it('prevents contradictions on future travel', () => {
        const {
            lever1, lever2,
            doorA, doorB, doorC,
            robotGoal,
            world: system
        } = createRobotWorld();

        // Open door C by pulling lever 1
        system.set(lever1, true);
        // See the robot
        expect(system.get(robotGoal)).toBe(true);
        // Observe it couldn't have gone through door A
        expect(system.get(doorA)).toBe(false);

        // Travel back in time to before lever 1 was pulled
        expect(system.travelTo(-1)).toBe(true);

        // And we could go back immediately if we wanted to
        expect(system.travelTo(0, true)).toBe(true);

        // Close door B
        system.set(lever2, false);

        // Now we can't travel back to period 0
        // because there's no way for the robot to have reached its goal
        expect(system.travelTo(0)).toBe(false);

        // Open door B again
        system.set(lever2, true);

        // Now we can travel back to period 0
        expect(system.travelTo(0)).toBe(true);
    });
})