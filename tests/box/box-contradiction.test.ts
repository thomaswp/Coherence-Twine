import { describe, expect, it } from 'vitest';
import { DerivedVariable, MutableVariable, NominalVariable, World } from '../../ts/state';

enum BoxLocations {
    BoxRoom = 'BoxRoom',
    TravelRoom = 'TravelRoom',
    DoorB = 'DoorB',
    DoorC = 'DoorC',
    Holding = 'Holding',
}

function createWorld() {
    const boxLocationValues = Object.values(BoxLocations);

    const box1 = new NominalVariable('box1', boxLocationValues, BoxLocations.BoxRoom);
    const box2 = new NominalVariable('box2', boxLocationValues, BoxLocations.TravelRoom);

    const lever1 = new MutableVariable('lever1', false, true);

    const doorA = new DerivedVariable('doorA', [lever1], (state) => state.get(lever1));
    const doorB = new DerivedVariable(
        'doorB',
        [box1, box2],
        (state) => state.get(box1) === BoxLocations.DoorB || state.get(box2) === BoxLocations.DoorB,
    );
    const doorC = new DerivedVariable(
        'doorC',
        [box1, box2],
        (state) => state.get(box1) === BoxLocations.DoorC || state.get(box2) === BoxLocations.DoorC,
    );

    const world = new World([lever1, doorA, doorB, doorC, box1, box2]);

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
        world.set(box1, BoxLocations.DoorB);
        expect(world.get(doorB)).toBe(true);
        // Observe box2's value, which is still the default of TravelRoom
        expect(world.get(box2)).toBe(BoxLocations.TravelRoom);
        expect(world.travelTo(-1)).toBe(true);

        // The box is reset back in T-1
        expect(world.peek(box1)).toBe(BoxLocations.BoxRoom);
        expect(world.peek(doorB)).toBe(false);
        world.set(box2, BoxLocations.DoorB);
        expect(world.get(doorB)).toBe(true);
        expect(world.peek(doorC)).toBe(false);
        world.set(box1, BoxLocations.DoorC);
        expect(world.get(doorC)).toBe(true);
        world.set(lever1, true);
        // Can't go through yet; only open in T0
        expect(world.get(doorA)).toBe(true);

        // Can't go back yet b/c boxes are in contradictory locations
        expect(world.canTravelTo(0)).toBe(false);
        world.set(box1, BoxLocations.BoxRoom);
        // Still 1 box out of it's originally observed location
        expect(world.canTravelTo(0)).toBe(false);
        world.set(box2, BoxLocations.TravelRoom);
        // Now both boxes are back in their original locations, so we can travel forward

        // TODO: For some reason the T0 start state has
        // doorB open, which shouldn't be the case, even if I explicitly
        // observe it as closed at the start.
        expect(world.travelTo(0)).toBe(true);

        // Now we can go through the door to the goal
        expect(world.get(doorA)).toBe(true);
    });
});
