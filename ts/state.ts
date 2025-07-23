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
        public readonly dependencies: MutableVariable[],
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
            state.set(dv, value);
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
            'observedVariables': new Map([...this.observedValues.entries()].map(([k, v]) => [k.name, v])),
            'concreteVariables': new Map([...this.toConcreteState().entries()].map(([k, v]) => [k.name, v])),
        }
    }
}

export class World {

    timePeriods = new Map<number, TimePeriod>();
    currentPeriod: TimePeriod;

    constructor(
        public readonly variables: Variable[],
        currentTime: number = 0,
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
        const observed = this.currentPeriod.toPartialConcreteEndState();
        return new PartialState(mutable, derived, observed)
    }

    set(variable: MutableVariable, value: boolean, observeFirst = true, observeAfter = true) {
        if (observeFirst) {
            this.get(variable)
        }
        this.currentPeriod.variableWasModified(variable, value);
        if (!variable.reversible) {
            // TODO: check for contradictions and update state!
        }
        if (observeAfter) {
            this.currentPeriod.variableWasObserved(variable, value);
        }
    }

    peek(variable: Variable) {
        // Should only happen for MutableVariables
        const value = this.currentPeriod.peekValue(variable);
        if (value !== undefined) {
            return value;
        }

        const currentState = this.getPartialState();
        const state = currentState.findConsistentState();
        if (!state) {
            // This needs testing, but I think it's correct for the
            // the current implementation and shouldn't be possible
            // if we prevent contradictions correctly.
            throw Error("Unresolvable contradiction!");
        }
        console.log(state.inspect());
        return state.getConcreteValue(variable);
    }

    /** Note: Always observes. Use peek for non-observing get. */
    get(variable: Variable) {
        const value = this.peek(variable);
        this.currentPeriod.variableWasObserved(variable, value);
        return value;
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
        return this.travelTo(time, true);
    }

    /**
     * Note: when traveling backwards, this method does not guarantee that a contradiction
     * cannot occur. The caller must ensure this.
     * @param time 
     * @returns 
     */
    travelTo(time: number, dryRun = false): boolean {
        if (time == this.currentTime) {
            console.warn(`Warning: Attempted to travel to current time ${time}`);
            return true;
        }

        if (!this.timePeriods.has(time)) {
            // TODO: set start state if traveling to unseen times
            this.timePeriods.set(time, new TimePeriod(this, time))
        }

        const destination = this.timePeriods.get(time);
        if (time < this.currentTime) {
            // We assume here that the caller has already checked to prevent the
            // possibility of creating a contradiction, so we don't check for that.
            // There's not really anything else to resolve then.
            this.currentPeriod = destination;
            return true;
        }
        
        const pastState = this.currentPeriod.toPartialConcreteEndState();
        const presentState = destination.toPartialConcreteStartState();
        const mergedState = this.tryMergeStates(pastState, presentState);

        if (!mergedState) {
            console.log(`Cannot travel to time ${time} because of a direct contradiction.`)
            return false;
        }

        const partialState = new PartialState(this.mutableVariables, this.derivedVariables, mergedState);
        const consistentState = partialState.findConsistentState();
        console.log(`Traveling to t${time}; reconciling states...`);
        console.log(`Past partial state`, pastState);
        console.log('Present partial state', presentState);
        console.log(consistentState.inspect());

        if (!consistentState) {
            console.log(`Cannot travel to time ${time} because of a logical contradiction.`)
            return false;
        }

        if (!dryRun) {
            for (let v of this.variables) {
                const oldValue = presentState.get(v);
                const newValue = consistentState.observedValues.get(v);

                if (oldValue !== newValue) {
                    console.log(`Overwriting start state for t${time}/${v.name}: ${oldValue}->${newValue}`);
                    destination.overrideStartState(v, newValue);
                }
            }

            this.currentPeriod = destination
        }

        return true;
    }

    private tryMergeStates(past: ConcreteState, present: ConcreteState): ConcreteState | undefined {
        const state = new Map<Variable, boolean>(past);
        for (let [key, value] of present.entries()) {
            const lastValue = state.get(key);
            if (lastValue !== undefined && lastValue !== value) {
                console.log(`Failed to merge states: ${key} was ${lastValue} now is ${value}`);
                return null;
            }
            state.set(key, value);
        }
        return state;
    }
}

type VarState = {
    // Would be good to actually calculate if it *was* modified but this 
    // approach is a good heuristic, is way easier and shouldn't ruin any puzzles
    /** Could this variable have been modified from its starting value? */
    couldHaveBeenModifiedAfterStart: boolean,
    /** Could this variable have been modified since it's last observation? */
    couldHaveBeenModifiedSinceObserved: boolean,
    /** Was this variable observed, before any modification, with its starting value. */
    observedStartValue: boolean,
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
        public readonly world: World,
        public readonly time: number,
        // Not sure if I want to do it this way...
        // Could wait until I implement forward travel to unseen times
        // Until then, should essentially always be a blank map
        // Does *not* need to specify existing variable defaults
        //
        // This is doubly confusing because in theory the start state
        // could change if we went back again and forward again...
        // But then I assume backwards travel would be prevented to 
        // prevent a contradiction.
        startValues: ConcreteState = new Map<Variable, boolean>()
    ) {
        for (let v of world.variables) {
            this.varStates.set(v, {
                couldHaveBeenModifiedAfterStart: false,
                couldHaveBeenModifiedSinceObserved: false,
                observedStartValue: undefined,
                startValue: startValues.get(v),
                currentValue: undefined
            });
        }
    }

    // Shouldn't be needed; can keep private
    // getState(variable: Variable) {
    //     return this.varStates.get(variable);
    // }

    /** Override the start state of a variable from its original
     * default value to resolve a contradiction. This should only
     * be used when resolving a contradiction, meaning that the variable
     * should not have been previously observed, nor have we locked in
     * a start value.
     */
    overrideStartState(variable: Variable, value: boolean) {
        const state = this.varStates.get(variable);
        if (state.startValue !== undefined) {
            throw Error(`Cannot override start state for ${variable.name} to ${value}; it is already set to ${state.startValue}`);
        }
        if (state.currentValue !== undefined) {
            throw Error(`Cannot override start state for ${variable.name} to ${value}; it is already observed as ${state.currentValue}`);
        }
        state.startValue = value;
        // The current value must be the start value because we haven't modified 
        state.currentValue = value;
        this.variableWasObserved(variable, value);
    }

    // wasVariableObservedWithStartValue(variable: Variable) {
    //     return this.varStates.get(variable).observedWithStartValue;
    // }

    /** 
     * Returns the last observed value for the variable, or a know start value if present. 
     * Does not return the variable's default value.
     */
    peekValue(variable: Variable) : boolean | undefined {
        const state = this.varStates.get(variable);
        return state.currentValue ?? state.startValue;
    }

    variableWasObserved(variable: Variable, value: boolean) {
        const state = this.varStates.get(variable);
        if (!state.couldHaveBeenModifiedAfterStart) state.observedStartValue = value;
        state.couldHaveBeenModifiedSinceObserved = false;
    }

    variableWasModified(modified: MutableVariable, value: boolean) {
        const state = this.varStates.get(modified);
        state.couldHaveBeenModifiedAfterStart = true;
        state.couldHaveBeenModifiedSinceObserved = true;
        state.currentValue = value;
        for (let dependent of this.world.variables) {
            if (dependent instanceof DerivedVariable) {
                if (dependent.dependencies.includes(modified)) {
                    this.varStates.get(dependent).couldHaveBeenModifiedSinceObserved = true;
                    this.updateCouldHaveBeenObserved(dependent);
                }
            }
        }
    }

    updateCouldHaveBeenObserved(variable: DerivedVariable) {
        let maybeModified = false;
        for (let v of variable.dependencies) {
            const state = this.varStates.get(v);
            const defaultValue = state.startValue ?? v.defaultValue;
            if (state.currentValue !== defaultValue) {
                maybeModified = true;
                break;
            }
        }
        this.varStates.get(variable).couldHaveBeenModifiedAfterStart = maybeModified;
    }

    toPartialConcreteEndState() {
        const state = new Map<Variable, boolean>();
        for (let v of this.world.variables) {
            const vState = this.varStates.get(v);
            const value = vState.currentValue;
            if (value !== undefined && !vState.couldHaveBeenModifiedSinceObserved) {
                state.set(v, value);
            }
        }
        return state;
    }

    toPartialConcreteStartState() {
        const state = new Map<Variable, boolean>();
        for (let v of this.world.variables) {
            const vState = this.varStates.get(v);
            if (vState.observedStartValue !== undefined) {
                state.set(v, vState.observedStartValue);
            }
        }
        return state;
    }
}