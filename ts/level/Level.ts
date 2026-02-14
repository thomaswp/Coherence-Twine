import { MutableVariable, Variable, World } from '../state';

export class Room {
    readonly connections: Connection[] = [];
    readonly entities: IInteractable[] = [];

    isStartingRoom: boolean = false;
    isGoalRoom: boolean = false;

    constructor(name: string) {}

    getConnection(direction: Direction): Connection | undefined {
        return this.connections.find((conn) => conn.direction === direction);
    }
}

export enum Direction {
    North,
    South,
    East,
    West,
}

export class Connection {
    constructor(
        public readonly from: Room,
        public readonly to: Room,
        public readonly direction: Direction,
        public readonly variable?: Variable,
    ) {}
}

interface IEntity {}

export interface IInteractable extends IEntity {
    getName(): string;

    // TODO: This should really be a whole UI, this is just a simplified version...
    interact(world: World): boolean;
}

export class Toggle implements IInteractable {
    constructor(public variable: MutableVariable) {}

    getName(): string {
        return `Toggle ${this.variable.name}`;
    }

    interact(world: World): boolean {
        if (!this.variable.reversible && this.variable.defaultValue !== world.get(this.variable)) {
            // If the variabiale is not reversible and has already been toggled
            // from its default value, we can't toggle it back
            return false;
        }
        world.set(this.variable, !world.get(this.variable));
        return true;
    }
}

export class TimeTravelBooth implements IInteractable {
    readonly allowedTimes: number[];

    constructor(allowedTimes: number[]) {
        this.allowedTimes = allowedTimes;
    }

    getName(): string {
        return `Travel booth`;
    }

    interact(world: World): boolean {
        if (this.allowedTimes.length < 2) {
            // Can't change the time if there's only one or zero allowed times
            return false;
        }

        const currentTimeIndex = this.allowedTimes.indexOf(world.currentPeriod.time);
        if (currentTimeIndex === -1) {
            throw new Error('Current time is not in allowed times');
        }

        const nextTimeIndex = (currentTimeIndex + 1) % this.allowedTimes.length;
        return world.travelTo(this.allowedTimes[nextTimeIndex]);
    }
}

class Condition {
    predicate: (world: World) => boolean;
}

export class Level {
    readonly rooms: Room[] = [];

    constructor(public readonly world: World) {}

    connect(from: Room, to: Room, direction: Direction, variable?: Variable) {
        const connection = new Connection(from, to, direction, variable);
        from.connections.push(connection);
        to.connections.push(connection);
        return connection;
    }

    getStartingRoom(): Room {
        const startingRoom = this.rooms.find((room) => room.isStartingRoom);
        if (!startingRoom) {
            throw new Error('No starting room found');
        }
        return startingRoom;
    }
}
