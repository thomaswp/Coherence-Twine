import { assert, describe, expect, it } from 'vitest';
import { DerivedVariable, MutableVariable, NumericVariableProxy, World } from '../../ts/state';

function createWorld(seed: number) {
    assert(seed >= 0 && seed < 4, 'Seed must be between 0 and 3');

    const button1 = new MutableVariable('button1', false, true);

    const randomDoor = new NumericVariableProxy('randomDoor', seed, 3);

    const doors = Array.from(
        { length: 4 },
        (_, i) =>
            new DerivedVariable(
                `door${i}Open`,
                [button1, ...randomDoor.variables],
                (state) => state.get(button1) && randomDoor.getValue(state) === i,
            ),
    );

    const world = new World([button1, ...randomDoor.variables, ...doors], [randomDoor]);

    return {
        button1,
        randomDoor,
        doors,
        world,
    };
}

describe('Random Tutorial World', () => {
    it('opens the correct door based on the seed', () => {
        for (let seed = 0; seed < 4; seed++) {
            const { button1, randomDoor, doors, world } = createWorld(seed);

            // To start, no doors should be open
            for (let i = 0; i < doors.length; i++) {
                expect(world.peek(doors[i])).toBe(false);
            }

            // Now, set the button to true
            world.set(button1, true);

            // Now, only the door corresponding to the seed should be open
            for (let i = 0; i < doors.length; i++) {
                expect(world.peek(doors[i])).toBe(i === seed);
            }
        }
    });
});
