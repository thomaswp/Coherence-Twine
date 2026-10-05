import { describe, expect, it } from 'vitest';
import { DerivedBoolean, MutableBoolean, MutableNominal, World } from '../../ts/state';

enum BoxLocations {
    DoorADefaultRoom = 'DoorADefaultRoom',
    DoorATravelRoom = 'DoorATravelRoom',
    DoorB = 'DoorB',
    DoorC = 'DoorC',
}

function createWorld() {
    const boxLocationValues = Object.values(BoxLocations);

    const box1 = new MutableNominal('box1', boxLocationValues, BoxLocations.DoorADefaultRoom);

    const lever1 = new MutableBoolean('lever1', false, true);

    const doorA = new DerivedBoolean(
        'doorA',
        [lever1, box1],
        (state) => state.get(lever1) && state.get(box1) === BoxLocations.DoorADefaultRoom,
    );
    const doorB = new DerivedBoolean(
        'doorB',
        [box1],
        (state) => state.get(box1) === BoxLocations.DoorB,
    );
    const doorC = new DerivedBoolean(
        'doorC',
        [box1],
        (state) => state.get(box1) === BoxLocations.DoorC,
    );

    const world = new World([lever1, doorA, doorB, doorC, box1]);

    return {
        box1,
        lever1,
        doorA,
        doorB,
        doorC,
        world,
    };
}

describe('Box Reconciliation World', () => {
    it('has a solution', () => {
        const { box1, lever1, doorA, doorB, doorC, world } = createWorld();

        // Don't observe box1's location or lever1's state

        // First observe where it's not
        expect(world.getHasValue(box1, BoxLocations.DoorATravelRoom)).toBe(false);
        expect(world.getHasValue(box1, BoxLocations.DoorC)).toBe(false);
        // Also observe that doorA is locked, currently because lever1 is false
        expect(world.get(doorA)).toBe(false);

        // No go back in time and meddle!
        expect(world.travelTo(-1)).toBe(true);
        world.set(lever1, true);

        // Now go back to the present and see if we can reconcile
        expect(world.travelTo(0)).toBe(true);

        // Door A must still be locked
        expect(world.peek(doorA)).toBe(false);
        // But lever1 must be true, because we set it in the past
        expect(world.peek(lever1)).toBe(true);
        // Which means that box1 must not be in DoorADefaultRoom, because doorA is locked
        expect(world.getHasValue(box1, BoxLocations.DoorADefaultRoom)).toBe(false);
        // And therefore the only place left for box1 to be is DoorB
        expect(world.getHasValue(box1, BoxLocations.DoorB)).toBe(true);
    });
});
