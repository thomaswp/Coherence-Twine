import { Direction, IInteractable, Level, Room } from '../level/Level';
import { World } from '../state';

export class Player {
    playerRoom: Room;
    readonly world: World;

    constructor(public readonly level: Level) {
        this.playerRoom = level.getStartingRoom();
        this.world = level.world;
    }

    move(direction: Direction): boolean {
        const toConn = this.playerRoom.getConnection(direction);
        if (!toConn) return false;

        if (toConn.variable) {
            const isOpen = this.world.get(toConn.variable);
            if (!isOpen) {
                return false;
            }
        }
        this.playerRoom = toConn.to;
        return true;
    }

    getInteractables(): IInteractable[] {
        return this.playerRoom.entities;
    }
}
