import { describe, expect, it } from 'vitest';
import { DerivedBoolean, MutableBoolean, MutableNominal, World } from '../../ts/state';

enum BoxLocations {
    BoxRoom = 'BoxRoom',
    DoorBBoxRoom = 'DoorBBoxRoom',
    DoorBTravelRoom = 'DoorBTravelRoom',
}

function createWorld() {
    const boxLocationValues = Object.values(BoxLocations);

    const box1 = new MutableNominal('box1', boxLocationValues, BoxLocations.BoxRoom);

    const lever1 = new MutableBoolean('lever1', false, true);

    const doorA = new DerivedBoolean('doorA', [lever1], (state) => state.get(lever1));
    const doorB = new DerivedBoolean('doorB', [box1], (state) => {
        return (
            state.get(box1) === BoxLocations.DoorBBoxRoom ||
            state.get(box1) === BoxLocations.DoorBTravelRoom
        );
    });

    const world = new World([lever1, doorA, doorB, box1]);

    return {
        box1,
        lever1,
        doorA,
        doorB,
        world,
    };
}

describe('Box Avoid Observation World', () => {
    it('has a solution', () => {
        const { box1, lever1, doorA, doorB, world } = createWorld();

        // Take the hidden passage to the travel room, without
        // moving or observing the box...
        expect(world.getHasValue(box1, BoxLocations.DoorBTravelRoom)).toBe(false);
        expect(world.travelTo(-1)).toBe(true);
        world.set(lever1, true);
        expect(world.peek(doorA)).toBe(true);
        world.set(box1, BoxLocations.DoorBTravelRoom);

        // Since we haven't observed the box's location, it can be at door B in the box room
        expect(world.travelTo(0)).toBe(true);
        // We can even walk out of door B
        expect(world.get(doorB)).toBe(true);
        // To the goal
        expect(world.get(doorA)).toBe(true);
    });

    it('can be messed up accidentally', () => {
        const { box1, lever1, doorA, doorB, world } = createWorld();

        // Same as before
        expect(world.getHasValue(box1, BoxLocations.DoorBTravelRoom)).toBe(false);
        // But accidentally observe that door B is locked before traveling
        expect(world.get(doorB)).toBe(false);
        expect(world.travelTo(-1)).toBe(true);
        world.set(lever1, true);
        world.set(box1, BoxLocations.DoorBTravelRoom);

        // Since we observed the door locked, there's nowhere else for the box to live
        expect(world.travelTo(0)).toBe(false);
    });

    it('has no trivial solution', () => {
        const { box1, lever1, doorA, doorB, world } = createWorld();
        world.set(box1, BoxLocations.DoorBBoxRoom);
        expect(world.get(doorB)).toBe(true);
        expect(world.travelTo(-1)).toBe(true);
        world.set(lever1, true);
        expect(world.get(doorA)).toBe(true);
        world.set(box1, BoxLocations.DoorBTravelRoom);

        // Cannot travel back to T=0 because the box is in DoorBBoxRoom,
        // which is not the location we observed it starting in at T0
        expect(world.travelTo(0)).toBe(false);
    });
});
