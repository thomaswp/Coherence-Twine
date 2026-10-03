import { describe, expect, it } from 'vitest';
import { DerivedVariable, DiscreteVariableProxy, MutableVariable, World } from '../../ts/state';

enum BoxLocations {
    BoxRoom = 'BoxRoom',
    TravelRoom = 'TravelRoom',
    DoorB = 'DoorB',
    DoorC = 'DoorC',
    Holding = 'Holding',
}

function createWorld() {
    const boxLocationValues = Object.values(BoxLocations);

    const box1 = new DiscreteVariableProxy('box1', boxLocationValues, 0);
    const box2 = new DiscreteVariableProxy('box2', boxLocationValues, 1);

    const lever1 = new MutableVariable('lever1', false, true);

    const doorA = new DerivedVariable('doorA', [lever1], (state) => state.get(lever1));
    const doorB = new DerivedVariable(
        'doorB',
        [...box1.variables],
        (state) =>
            box1.peekValue(state) === BoxLocations.DoorB ||
            box2.peekValue(state) === BoxLocations.DoorB,
    );
    const doorC = new DerivedVariable(
        'doorC',
        [...box1.variables],
        (state) =>
            box1.peekValue(state) === BoxLocations.DoorC ||
            box2.peekValue(state) === BoxLocations.DoorC,
    );

    const world = new World([lever1, doorA, doorB, doorC], [box1, box2]);

    return {
        box1,
        box2,
        lever1,
        doorA,
        doorB,
        doorC,
        world,
    };
}

describe('Box Contradiction World', () => {
    it('has a solution', () => {
        const { box1, box2, lever1, doorA, doorB, doorC, world } = createWorld();
        expect(world.peek(doorA)).toBe(false);
        expect(world.peek(doorB)).toBe(false);
        expect(world.peek(doorC)).toBe(false);
        box1.setValue(world, BoxLocations.DoorB);
        expect(world.get(doorB)).toBe(true);
        expect(world.travelTo(-1)).toBe(true);

        // The box is reset back in T-1
        expect(box1.peekIfValueIs(world, BoxLocations.BoxRoom)).toBe(true);
        expect(world.peek(doorB)).toBe(false);
        box2.setValue(world, BoxLocations.DoorB);
        expect(world.get(doorB)).toBe(true);
        expect(world.peek(doorC)).toBe(false);
        box1.setValue(world, BoxLocations.DoorC);
        expect(world.get(doorC)).toBe(true);
        world.set(lever1, true);
        // Can't go through yet; only open in T0
        expect(world.get(doorA)).toBe(true);

        // Can't go back yet b/c boxes are in contradictory locations
        expect(world.canTravelTo(0)).toBe(false);
        box1.setValue(world, BoxLocations.BoxRoom);
        // Still 1 box out of it's originally observed location
        expect(world.canTravelTo(0)).toBe(false);
        box2.setValue(world, BoxLocations.TravelRoom);
        // Now both boxes are back in their original locations, so we can travel forward
        expect(world.travelTo(0)).toBe(true);

        // Now we can go through the door to the goal
        expect(world.get(doorA)).toBe(true);
    });
});
