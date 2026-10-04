import { describe, expect, it } from 'vitest';
import { DerivedBoolean, MutableBoolean, MutableNominal, World } from '../../ts/state';

enum BoxLocations {
    BoxRoom = 'BoxRoom',
    TravelRoom = 'TravelRoom',
    DoorB = 'DoorB',
    DoorC = 'DoorC',
    Holding = 'Holding',
}

function createWorld() {
    const boxLocationValues = Object.values(BoxLocations);

    const box1 = new MutableNominal('box1', boxLocationValues, BoxLocations.BoxRoom);
    const box2 = new MutableNominal('box2', boxLocationValues, BoxLocations.TravelRoom);

    const lever1 = new MutableBoolean('lever1', false, true);

    const doorA = new DerivedBoolean('doorA', [lever1], (state) => state.get(lever1));
    const doorB = new DerivedBoolean(
        'doorB',
        [box1, box2],
        (state) => state.get(box1) === BoxLocations.DoorB || state.get(box2) === BoxLocations.DoorB,
    );
    const doorC = new DerivedBoolean(
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
        expect(world.travelTo(0)).toBe(true);

        // Now we can go through the door to the goal
        expect(world.get(doorA)).toBe(true);
    });

    // With the current logic, it makes sense that boxes are not interchangeable
    // TODO: They probably should be for some cool future puzzles
    it('does not allow boxes to be interchangeable', () => {
        const { box1, box2, lever1, doorA, doorB, doorC, world } = createWorld();
        world.set(box1, BoxLocations.DoorB);
        expect(world.get(doorB)).toBe(true);
        expect(world.get(box2)).toBe(BoxLocations.TravelRoom);
        expect(world.travelTo(-1)).toBe(true);

        world.set(box2, BoxLocations.DoorB);
        expect(world.get(doorB)).toBe(true);
        world.set(box1, BoxLocations.DoorC);
        expect(world.get(doorC)).toBe(true);
        world.set(lever1, true);
        expect(world.get(doorA)).toBe(true);

        // Pub boxes are in opposite locations
        // In reality this would require some shuffling but
        // should be possible to achieve
        world.set(box2, BoxLocations.BoxRoom);
        world.set(box1, BoxLocations.TravelRoom);
        // Currently not allowed
        expect(world.travelTo(0)).toBe(false);
        world.set(box2, BoxLocations.TravelRoom);
        world.set(box1, BoxLocations.BoxRoom);
        // Have to be reset
        expect(world.travelTo(0)).toBe(true);
    });
});
