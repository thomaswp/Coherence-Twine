


export abstract class Variable {
    observations: Observation[] = [];

    constructor(
        public readonly name: string, 
    ) { }

    get(time: number): boolean {
        return false; // Placeholder implementation
    }
}

export class MutableVariable extends Variable {
    constructor(
        name: string, 
        public readonly defaultValue: boolean
    ) { 
        super(name);
    }

    set(value: boolean, time: number): void {
        this.observations.push({value, time});
    }
}

export class DerivedVariable extends Variable {
    constructor(
        name: string, 
        private readonly getValue: (state: State) => boolean
    ) { 
        super(name);
    }
}

export class State {
    get(variable: Variable): boolean {
        return false; // Placeholder implementation
    }
}

export type Observation = {
    value: boolean;
    time: number;
}

export class System {
    constructor(
        public readonly variables: Variable[],
        private time: number = 0
    ) {}

    travel(time: number): boolean {
        return false;
    }

    get(variable: Variable): boolean {
        return false;
    }

    set(variable: MutableVariable, value: boolean) {

    }
}