import { describe, expect, it } from 'vitest';
import { DerivedBoolean, MutableBoolean, World } from '../../ts/state';

function createWorld() {
    // Despite being levers, these two are inaccessible and therefore immutable.
    const lever1 = new MutableBoolean('lever1', true, false);
    const lever2 = new MutableBoolean('lever2', false, false);
    const lever3 = new MutableBoolean('lever3', false);
    const button1 = new MutableBoolean('button1', false, false);
    const doorA = new DerivedBoolean('doorAOpen', [lever1, lever3], (state) => {
        return !state.get(lever1) && !state.get(lever3);
    });
    const doorB = new DerivedBoolean('doorBOpen', [lever1, lever2, button1], (state) => {
        return state.get(lever1) != state.get(button1) || state.get(lever2);
    });
    const doorC = new DerivedBoolean('doorCOpen', [lever2], (state) => state.get(lever2));
    const doorD = new DerivedBoolean('doorDOpen', [lever3], (state) => state.get(lever3));

    const world = new World([lever1, lever2, lever3, button1, doorA, doorB, doorC, doorD]);

    return {
        lever1,
        lever2,
        lever3,
        button1,
        doorA,
        doorB,
        doorC,
        doorD,
        world,
    };
}

describe('Camera Demo World', () => {
    it('has a solution', () => {
        const { lever1, lever2, lever3, button1, doorA, doorB, doorC, doorD, world } =
            createWorld();

        expect(world.get(doorB)).toBe(true);
        const picture = world.takePicture(doorA);
        expect(picture.peekValue()).toBe(false);
        expect(world.travelTo(-1)).toBe(true);

        // TODO: would you be able to create a contradiction by viewing door A
        // before pressing the button?
        expect(world.peek(doorA)).toBe(false);
        world.set(button1, true);
        expect(world.get(doorA)).toBe(true);

        expect(world.peek(doorC)).toBe(false);
        expect(picture.getValue()).toBe(false);
        expect(world.get(doorC)).toBe(true);
        expect(world.peek(doorA)).toBe(true);

        expect(world.canTravelTo(0)).toBe(false);
        world.set(lever3, true);
        expect(world.travelTo(0)).toBe(true);
        expect(world.get(doorD)).toBe(true);
    });
});
