import { DerivedVariable, MutableVariable, World } from '../../state';
import { Direction, Level, Room, TimeTravelBooth, Toggle } from '../Level';

type BooleanSystem = {
    lever1: MutableVariable;
    lever2: MutableVariable;
    doorC: DerivedVariable;
    doorB: DerivedVariable;
    world: World;
};

export function createBooleanWorld(): BooleanSystem {
    const lever1 = new MutableVariable('lever1', true);
    const lever2 = new MutableVariable('lever2', false);
    const doorB = new DerivedVariable('labBOpen', [lever2], (state) => state.get(lever2));
    const doorC = new DerivedVariable('labCOpen', [lever1, lever2], (state) => {
        return state.get(lever1) || state.get(lever2);
    });

    const world = new World([lever1, lever2, doorC, doorB]);

    return {
        lever1,
        lever2,
        doorB,
        doorC,
        world,
    };
}

export function createLevel() {
    const { lever1, lever2, doorC, doorB, world } = createBooleanWorld();

    const level = new Level(world);

    const start = new Room('Start');
    const labA = new Room('Lab A');
    const labB = new Room('Lab B');
    const labC = new Room('Lab C');
    const labD = new Room('Lab D');

    level.connect(start, labA, Direction.North);
    level.connect(labA, labB, Direction.East, doorB);
    level.connect(labA, labC, Direction.West, doorC);
    level.connect(labA, labD, Direction.North);

    start.isStartingRoom = true;
    start.entities.push(new TimeTravelBooth());

    labA.entities.push(new Toggle(lever1));

    labB.isGoalRoom = true;

    labD.entities.push(new Toggle(lever2));
}
