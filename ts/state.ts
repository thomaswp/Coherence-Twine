import { assert } from "vitest";



export abstract class Variable {

    constructor(
        public readonly name: string, 
    ) { }
}

export class MutableVariable extends Variable {
    constructor(
        name: string, 
        public readonly defaultValue: boolean,
        // TODO: Reversible should be dependent on time
        // (you can get to some levers only in some times)
        public readonly reversible = true,
    ) { 
        super(name);
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

function copyMap<Q,P>(map: Map<Q,P>) {
    return new Map<Q,P>(map.entries());
}

export class State {

    get variables() { return this.system.variables; }

    constructor(
        private readonly system: System,
        private time: number,
        protected readonly observations: Map<Variable, Observations> = null
    ) { 
        if (observations == null) {
            this.observations = new Map<Variable, Observations>();
            this.variables.forEach(v => {
                this.observations.set(v, new Observations());
            });
        }
    }

    get(variable: Variable): boolean {
        const observation = this.observations.get(variable);

        let result;
        if (observation.any()) {
            result = observation.get(this.time);
        } else {
            
        }
        // Not automatic for now...
        // this.observations.set(result, time);
        return result;
    }

    resolve(variable: Variable) {
        if (this.observations.get(variable).any()) {
            throw Error("Cannot resolve observed variable.")
        }
        const state = this.copy();
    }

    /**
     * Should we allow forward travel?
     * This requires that there are no contradictions between the
     * current and future state you're traveling to, including
     * inconsistencies in the current time.
     */
    isConsistentWithFuture(futureTime: number) {

    }

    hasContradiction() {

    }

    copy() {
        const observations = new Map<Variable, Observations>();
        for (let [vara, obs] of this.observations.entries()) {
            observations.set(vara, obs.copy());
        }
        return new State(this.system, this.time, observations);
    }
}

class Observations {

    constructor(
        protected readonly values = new Map<number, boolean>()
    ) { }; 

    set(value: boolean, time: number) {
        this.values.set(time, value);
    }

    any() {
        return this.values.size > 0;
    }

    get(time): boolean | undefined {
        if (this.values.has(time)) return this.values.get(time);

        let minTime = Number.MAX_VALUE;
        let minValue = undefined;
        for (let [t, value] of this.values.entries()) {
            // Even observations from the future override the default value
            if (t < minTime) {
                minValue = value;
                minTime = t;
            }
        }
        return minValue;
    }

    copy() {
        return new Observations(copyMap(this.values));
    }
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