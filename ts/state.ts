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
        public readonly dependencies: Variable[],
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

    getConcreteValue(variable: Variable): boolean | null {
        if (this.observedValues.has(variable)) {
            return this.observedValues.get(variable);
        }
        // This could be more efficient, but that's not really
        // an issue and I like the consistency of not duplicating
        // the calculation.
        return this.toConcreteState().get(variable);
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
            const currentState = this.getPartialState();
            const state = currentState.findConsistentState();
            if (!state) {
                // I think this is too severe. The future shouldn't be
                // able to create a contradiction quite yet right?
                throw Error("Unresolvable contradiction!");
            }
            result = state.getConcreteValue(variable);
            for (const [variable, value] of state.observedValues) {
                if (!currentState.observedValues.has(variable)) {
                    // Add any new observations from the resolution
                    this.observations.get(variable).set(value, this.time);
                }
            }
        }
        observation.set(result, this.time);
        return result;
    }

    /**
     * Should we allow forward travel?
     * This requires that there are no contradictions between the
     * current and future state you're traveling to, including
     * inconsistencies in the current time.
     */
    canTravelTo(time: number): boolean {
        // TODO!
        return false;
    }

    travelTo(newTime: number): boolean {
        if (!this.canTravelTo(newTime)) return false;
        this.time = newTime;
        // TODO: merge states!
        return true;
    }

    // TODO: Probably don't need anymore
    copy() {
        const observations = new Map<Variable, Observations>();
        for (let [vara, obs] of this.observations.entries()) {
            observations.set(vara, obs.copy());
        }
        return new World(this.system, this.time, observations);
    }
}

export class World2 {

    timePeriods = new Map<number, TimePeriod>();
    currentPeriod: TimePeriod;

    constructor(
        currentTime: number,
        public readonly variables: Variable[],
    ) {
        this.currentPeriod = new TimePeriod(this, currentTime);
        this.timePeriods.set(currentTime, this.currentPeriod);
    }

    get currentTime() { return this.currentPeriod.time; }

    get mutableVariables() { return this.variables.filter (v => v instanceof MutableVariable); }

    get derivedVariables() { return this.variables.filter (v => v instanceof DerivedVariable); }

    getPartialState() {
        const mutable = this.mutableVariables;
        const derived = this.derivedVariables;
        const observed = new Map<Variable, boolean>();
        for (const v of this.variables) {
            const value = this.currentPeriod.peekValue(v);
            if (value !== undefined) observed.set(v, value);
        }
        return new PartialState(mutable, derived, observed)
    }

    set(variable: MutableVariable, value: boolean, observeFirst: boolean, observeAfter: boolean) {
        if (observeFirst) {
            this.currentPeriod.variableWasObserved(variable);
        }
        this.currentPeriod.variableWasModified(variable, value);
        if (!variable.reversible) {
            // TODO: check for contradictions and update state!
        }
        if (observeAfter) {
            this.currentPeriod.variableWasObserved(variable);
        }
    }

    peek(variable: Variable) {
        const value = this.currentPeriod.peekValue(variable);
        if (value !== undefined) {
            return value;
        }

        const currentState = this.getPartialState();
        const state = currentState.findConsistentState();
        if (!state) {
            // This needs testing, but I think it's correct for the
            // the current implementation.
            throw Error("Unresolvable contradiction!");
        }
        return state.getConcreteValue(variable);
    }

    /** Note: Always observes. Use peek for non-observing get. */
    // TODO: I don't think this is right for derived variables...
    get(variable: Variable) {
        this.currentPeriod.variableWasObserved(variable);
        return this.peek(variable);
        // I don't think we need this anymore. I don't *think* we ever need
        // to update the state because of an observation.
        // for (const [variable, value] of state.observedValues) {
        //     if (!currentState.observedValues.has(variable)) {
        //         // Add any new observations from the resolution
        //         this.observations.get(variable).set(value, this.time);
        //     }
        // }
    }

    canTravelTo(time: number): boolean {
        // TODO!
        return false;
    }

    /**
     * Note: when traveling backwards, this method does not guarantee that a contradiction
     * cannot occur. The caller must ensure this.
     * @param time 
     * @returns 
     */
    travelTo(time: number): boolean {
        if (time == this.currentTime) {
            console.warn(`Warning: Attempted to travel to current time ${time}`);
            return true;
        }

        if (!this.timePeriods.has(time)) {
            // TODO: set start state if traveling to unseen times
            this.timePeriods.set(time, new TimePeriod(this, time))
        }

        const destination = this.timePeriods.get(time);
        if (time > this.currentTime) {
            // We assume here that the caller has already checked to prevent the
            // possibility of creating a contradiction, so we don't check for that.
            // There's not really anything else to resolve then.
            this.currentPeriod = destination;
            return true;
        }
        
        // TODO: Get state different if it's the past vs present (only observed initial)
        // Also, not 100% clear how to handle variables that were observed after they could have
        // been mutated.
        const pastState = this.currentPeriod.toPartialConcreteEndState();
        const presentState = destination.toPartialConcreteStartState();
        const mergedState = this.tryMergeStates(pastState, presentState);

        if (!mergedState) {
            console.log(`Cannot travel to time ${time} because of a direct contradiction.`)
            return false;
        }

        const partialState = new PartialState(this.mutableVariables, this.derivedVariables, mergedState);
        const consistentState = partialState.findConsistentState();

        if (!consistentState) {
            console.log(`Cannot travel to time ${time} because of a logical contradiction.`)
            return false;
        }

        for (let v of this.variables) {
            const oldValue = presentState.get(v);
            const newValue = partialState.observedValues.get(v);

            if (oldValue !== newValue) {
                // TODO: somehow modify the old state...
                // start or end? not sure
            }
        }

        // TODO: look for contradictions and make observations if state is changed!
    }

    private tryMergeStates(past: ConcreteState, present: ConcreteState): ConcreteState | undefined {
        const state = new Map<Variable, boolean>(past);
        for (let [key, value] of present.entries()) {
            const lastValue = state.get(key);
            if (lastValue !== undefined && lastValue !== value) {
                console.log(`Failed to merge states: ${key} was ${lastValue} now is ${value}`);
                return null;
            }
        }
        return state;
    }
}

type VarState = {
    // TODO: Would be good to actually calculate if it *was* modified
    // but this conservative approach is way easier and it won't ruin any puzzles (yet)
    /** Could this variable have been modified from its starting value? */
    couldHaveBeenModifiedAfterStart: boolean,
    // Maybe???
    couldHaveBeenModifiedSinceObserved: boolean,
    /** Was this variable observed, before any modification, with its starting value. */
    observedWithStartValue: boolean,
    // Pretty much always the regular default value unless traveling forward
    // to a previously unseen time period
    /** A fixed starting value for this variable, if known. */
    startValue: boolean | undefined,
    /** The most recent observed value for this variable, or unknown if currently unobserved. */
    currentValue: boolean | undefined,
}

export class TimePeriod {

    private varStates = new Map<Variable, VarState>();

    constructor(
        public readonly world: World2,
        public readonly time: number,
        // Not sure if I want to do it this way...
        // Could wait until I implement forward travel to unseen times
        // Until then, should essentially always be a blank map
        // Does *not* need to specify existing variable defaults
        startValues: ConcreteState = new Map<Variable, boolean>()
    ) {
        for (let v of world.variables) {
            this.varStates.set(v, {
                couldHaveBeenModifiedAfterStart: false,
                couldHaveBeenModifiedSinceObserved: false,
                observedWithStartValue: false,
                startValue: startValues.get(v),
                currentValue: undefined
            });
        }
    }

    // Shouldn't be needed; can keep private
    // getState(variable: Variable) {
    //     return this.varStates.get(variable);
    // }

    wasVariableObservedWithStartValue(variable: Variable) {
        return this.varStates.get(variable).observedWithStartValue;
    }

    peekValue(variable: Variable) : boolean | undefined {
        const state = this.varStates.get(variable);
        return state.currentValue ?? state.startValue;
    }

    variableWasObserved(variable: Variable) {
        const state = this.varStates.get(variable);
        if (!state.couldHaveBeenModifiedAfterStart) state.observedWithStartValue = true;
    }

    variableWasModified(modified: MutableVariable, value: boolean) {
        this.varStates.get(modified).couldHaveBeenModifiedAfterStart = true;
        this.varStates.get(modified).currentValue = value;
        for (let dependent of this.world.variables) {
            if (dependent instanceof DerivedVariable) {
                if (dependent.dependencies.includes(modified)) {
                    // TODO: Make this an update function that checks whether any
                    // dependencies have been modified from start values
                    this.varStates.get(dependent).couldHaveBeenModifiedAfterStart = true;
                }
            }
        }
    }

    toPartialConcreteEndState() {
        // TODO: Consider that variables may have been modified!
        const state = new Map<Variable, boolean>();
        for (let v of this.world.variables) {
            const value = this.varStates.get(v).currentValue;
            if (value !== undefined) state.set(v, value);
        }
        return state;
    }

    toPartialConcreteStartState() {
        const state = new Map<Variable, boolean>();
        // TODO: !!
        return state;
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

    hasExact(time): boolean {
        return this.values.has(time);
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