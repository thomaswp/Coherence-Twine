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
        private readonly getValue: (state: ConcreteState) => boolean
    ) { 
        super(name);
    }

    deriveValue(state: ConcreteState) {
        return this.getValue(state);
    }
}

function copyMap<Q,P>(map: Map<Q,P>) {
    return new Map<Q,P>(map);
}

// Contains values for all variables
type ConcreteState = Map<Variable, boolean>;

export class PartialState {
    constructor(
        readonly mutableVariables: MutableVariable[],
        readonly derivedVariables: DerivedVariable[],
        readonly observedValues = new Map<Variable, boolean>()
    ) {}

    // Here we assume that any unobserved variables will
    // have their default values.
    isDefaultContradictory(): boolean {
        return this.toConcreteState() == null;
    }

    findConsistentState(): PartialState | null {
        // console.log("Checking for consistency", this.observedValues);
        if (!this.isDefaultContradictory()) return this;

        const mutableVars = this.mutableVariables.filter(
            mv => !this.observedValues.has(mv));
        
        for (const mv of mutableVars) {
            const state = this.copy();
            // Since we know the default value doesn't work
            // try the opposite
            state.observedValues.set(mv, !mv.defaultValue)
            // console.log(`Altering ${mv.name} -> ${!mv.defaultValue}`);
            const ps = state.findConsistentState();
            if (ps != null) return ps;
        }
        return null;
    }

    toConcreteState(): ConcreteState | null {
        // Start with observations
        const state = copyMap(this.observedValues);
        // The add default values for 
        for (const mv of this.mutableVariables) {
            if (!state.has(mv)) {
                state.set(mv, mv.defaultValue);
            }
        }
        for (const dv of this.derivedVariables) {
            const value = dv.deriveValue(state);
            const existingValue = state.get(dv);
            if (existingValue != undefined && existingValue != value) {
                // Could return the actual contradiction
                return null;
            }
        }
        return state;
    }

    copy() {
        const observed = copyMap(this.observedValues);
        return new PartialState(this.mutableVariables, this.derivedVariables, observed);
    }

    inspect() {
        return {
            'mutableVariables': this.mutableVariables.map(v => v.name),
            'derivedVariables': this.derivedVariables.map(v => v.name),
            'observedVariables': new Map([...this.observedValues.entries()].map(([k, v]) => [k.name, v]))
        }
    }
}

export class World {

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

    getPartialState() {
        const mutable = this.variables.filter (v => v instanceof MutableVariable);
        const derived = this.variables.filter (v => v instanceof DerivedVariable);
        const observed = new Map<Variable, boolean>();
        for (const v of this.variables) {
            const obs = this.observations.get(v);
            if (obs.any()) {
                observed.set(v, obs.get(v))
            }
        }
        return new PartialState(mutable, derived, observed)
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
        return new World(this.system, this.time, observations);
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
        // TODO: This should actually first check for any observations
        // in the past and use the most recent one, and if not, use
        // the earliest observation in the future.
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
    private world: World;

    constructor(
        public readonly variables: Variable[],
        time: number = 0
    ) {
        this.world = new World(this, time);
    }

    travel(time: number): boolean {
        return false;
    }

    get(variable: Variable): boolean {
        return false;
    }

    set(variable: MutableVariable, value: boolean) {

    }
}