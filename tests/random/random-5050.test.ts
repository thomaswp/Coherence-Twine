import { describe, it, expect, assert } from 'vitest'
import { World, MutableVariable, DerivedVariable, PartialState, Variable, NumericVariableProxy, TriggeredVariable } from '../../ts/state'

function createWorld(seed: number) {

    const nValues = 3;

    assert(seed >= 0 && seed < nValues, `Seed must be between 0 and ${nValues - 1}`);
    
    const button1 = new MutableVariable('button1', false, true);

    const randomDoor = new NumericVariableProxy(
        'randomDoor', seed, nValues - 1
    );

    const doors = Array.from({ length: nValues }, (_, i) => 
        new DerivedVariable(`door${i}Open`,
            [button1, ...randomDoor.variables],
            (state) => state.get(button1) && randomDoor.getValue(state) === i
        )
    );
    const [doorA, doorB, doorC] = doors;

    const robotGoal = new TriggeredVariable('robotAtGoal',
        [button1, doorA, doorB],
        (state) => state.get(button1) && (state.get(doorA) || state.get(doorB)),
        true
    );

    const world = new World([
        button1,
        ...randomDoor.variables,
        ...doors,
        robotGoal,
    ], [randomDoor]);

    return {
        button1,
        randomDoor,
        doorA, doorB, doorC,
        robotGoal,
        world
    };
}

describe('Random 50/50 World', () => {
    it('has a solution for all seeds', () => {
        for (let seed = 0; seed < 3; seed++) {
            console.log(`=== testing for seed ${seed} ===`)
            const {
                button1,
                randomDoor,
                doorA, doorB, doorC,
                robotGoal,
                world,
            } = createWorld(seed);

            // Initially, all doors are closed
            expect(world.peek(doorA)).toBe(false);
            expect(world.peek(doorB)).toBe(false);
            expect(world.peek(doorC)).toBe(false);

            // Observe that the robot is not at the goal
            expect(world.get(robotGoal)).toBe(false);

            expect(world.travelTo(-1)).toBe(true);

            // TODO: This should actually trigger resolution!
            // A good use case for it: can't cause a contradiction
            // because the randomDoor is unobservable
            world.set(button1, true);

            // Regardless of seed, doorC must open 
            expect(world.get(doorC)).toBe(true);

            // Goal!

            // The rest of the state is as we left it
            expect(world.get(doorA)).toBe(false);
            expect(world.get(doorB)).toBe(false);
            expect(world.get(robotGoal)).toBe(false);
        }
    });
});