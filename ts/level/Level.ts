import { MutableVariable, Variable, World } from '../state';

export class Room {
    connections: Connection[] = [];
    entities: IEntity[] = [];

    isStartingRoom: boolean = false;
    isGoalRoom: boolean = false;

    constructor(name: string) {}
}

export enum Direction {
    North,
    South,
    East,
    West,
}

export class Connection {
    constructor(
        public from: Room,
        public to: Room,
        public direction: Direction,
        public variable?: Variable,
    ) {}
}

interface IEntity {}

export class Toggle implements IEntity {
    constructor(public variable: MutableVariable) {}
}

export class Level {
    rooms: Room[] = [];

    constructor(world: World) {}

    connect(from: Room, to: Room, direction: Direction, variable?: Variable) {
        const connection = new Connection(from, to, direction, variable);
        from.connections.push(connection);
        to.connections.push(connection);
        return connection;
    }
}

export class TimeTravelBooth implements IEntity {
    allowedTimes: number[];
}

class Condition {
    predicate: (world: World) => boolean;
}
