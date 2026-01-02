
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

interface DependentVariable {
    isDependentOn(variable: Variable): boolean;
}

export class DerivedVariable extends Variable implements DependentVariable {
    constructor(
        name: string,
        public readonly dependencies: MutableVariable[],
        private readonly getValue: (state: ConcreteState) => boolean
    ) { 
        super(name);
    }

    isDependentOn(variable: Variable): boolean {
        return this.dependencies.includes(variable as MutableVariable);
    }

    deriveValue(state: ConcreteState) {
        return this.getValue(state);
    }
}

/**
 * A proxy for a numeric variable, which is defined as a set of boolean variables
 * representing ranges of values in binary.
 * Includes helper functions for generating the boolean variables and converting
 * their collective state to a numeric value.
 */
export class NumericVariableProxy {

    public readonly variables: readonly MutableVariable[];
    private readonly numBits: number;

    constructor(
        public readonly name: string,
        startingValue: number,
        public readonly maxValue: number,
    ) {
        this.numBits = Math.ceil(Math.log2(this.maxValue + 1));
        const booleanVariables = [];
        const startingBits = this.toBooleanArray(startingValue);
        for (let i = 0; i < this.numBits; i++) {
            booleanVariables.push(
                new MutableVariable(`${this.name}_bit${i}`, startingBits[i] || false)
            );
        }
        this.variables = booleanVariables;
    }

    public static fromProbabilityDistribution(
        name: string,
        probabilities: number[]
    ): NumericVariableProxy {
        const total = probabilities.reduce((a, b) => a + b, 0);
        if (total <= 0) {
            throw Error("Total probability must be greater than zero");
        }
        const normalized = probabilities.map(p => p / total);
        let cumulative = 0;
        const rand = Math.random();
        for (let i = 0; i < normalized.length; i++) {
            cumulative += normalized[i];
            if (rand <= cumulative) {
                return new NumericVariableProxy(name, normalized.length - 1, i);
            }
        }
        // Fallback in case of rounding errors
        return new NumericVariableProxy(name, normalized.length - 1, normalized.length - 1);
    }

    private toBooleanArray(value: number): boolean[] {
        const bits: boolean[] = [];
        for (let i = 0; i < this.numBits; i++) {
            bits.push((value & (1 << i)) !== 0);
        }
        return bits;
    }

    isInValidState(state: ConcreteState): boolean {
        const value = this.getValue(state);
        return value >= 0 && value <= this.maxValue;
    }

    getValue(state: ConcreteState): number {
        let value = 0;
        for (let i = 0; i < this.numBits; i++) {
            if (state.get(this.variables[i])) {
                value += (1 << i);
            }
        }
        return value;
    }
}

export class TriggeredVariable extends Variable implements DependentVariable {
    constructor(
        name: string,
        // Dependencies are mutable or derived
        private readonly dependencies: Variable[],
        private readonly isTriggered: (state: ConcreteState) => boolean,
        /** If false, the triggered variable resets to its default value when traveling back in time */
        // TODO: Implement!
        public readonly isPersistent: boolean
    ) { 
        super(name);
    }

    isDependentOn(variable: Variable): boolean {
        for (let dep of this.dependencies) {
            if (dep === variable) return true;
            if (dep instanceof DerivedVariable || dep instanceof TriggeredVariable) {
                if (dep.isDependentOn(variable)) {
                    return true;
                }
            }
        }
        return false;
    }

    shouldTrigger(state: ConcreteState) {
        return this.isTriggered(state);
    }
}

function copyMap<Q,P>(map: Map<Q,P>) {
    return new Map<Q,P>(map);
}


// Contains values for all variables
type ConcreteState = Map<Variable, boolean>;

function inspectState(state: ConcreteState) {
    return new Map([...state.entries()].map(([k, v]) => [k.name, v]));
}

export class PartialState {
    constructor(
        readonly world : World,
        readonly observedValues = new Map<Variable, boolean>(),
        /** If true, triggers must match explicitly */
        public resolveMissingTriggers = false,
    ) {}

    get mutableVariables() {
        return this.world.mutableVariables;
    }

    get derivedVariables() {
        return this.world.derivedVariables;
    }

    get triggeredVariables() {
        return this.world.triggeredVariables;
    }

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
            if (existingValue !== undefined && existingValue !== value) {
                // Could return the actual contradiction
                return null;
            }
            state.set(dv, value);
        }
        // We check triggered variables here because they could have
        // been triggered by a combination observations in the two merged states
        // and thus not yet triggered.
        for (const tv of this.triggeredVariables) {
            const shouldTrigger = tv.shouldTrigger(state);
            const existingValue = state.get(tv);
            
            // If we're resolving missing triggers, we compare exactly
            if (this.resolveMissingTriggers) {
                if (existingValue !== undefined && existingValue !== shouldTrigger) {
                    return null;
                }
                state.set(tv, shouldTrigger);
                continue;
            }

            // If we've already observed that this _hasn't_ triggered, 
            // but it would have in this state, that's a contradiction
            if (existingValue === false && shouldTrigger) {
                return null;
            }
            // Otherwise, set it to the existing value (if present)
            // or the newly triggered value
            state.set(tv, existingValue ?? shouldTrigger);
        }
        // Make sure our numeric variables have valid values
        // (i.e. it's not set to a binary combination that exceeds the max)
        for (const nvp of this.world.numericVariableProxies) {
            if (!nvp.isInValidState(state)) {
                return null;
            }
        }
        return state;
    }

    copy() {
        const observed = copyMap(this.observedValues);
        return new PartialState(this.world, observed, this.resolveMissingTriggers);
    }

    inspect() {
        return {
            'mutableVariables': this.mutableVariables.map(v => v.name),
            'derivedVariables': this.derivedVariables.map(v => v.name),
            'triggeredVariables': this.triggeredVariables.map(v => v.name),
            'observedVariables': inspectState(this.observedValues),
            'concreteVariables': inspectState(this.toConcreteState()),
        }
    }
}

export class World {

    timePeriods = new Map<number, TimePeriod>();
    currentPeriod: TimePeriod;
    public readonly mutableVariables: readonly MutableVariable[];
    public readonly derivedVariables: readonly DerivedVariable[]
    public readonly triggeredVariables: readonly TriggeredVariable[];

    constructor(
        public readonly variables: Variable[],
        public readonly numericVariableProxies: NumericVariableProxy[] = [],
        currentTime: number = 0,
    ) {
        this.currentPeriod = new TimePeriod(this, currentTime);
        this.timePeriods.set(currentTime, this.currentPeriod);
        this.mutableVariables = this.variables.filter(v => v instanceof MutableVariable) as MutableVariable[];
        this.derivedVariables = this.variables.filter(v => v instanceof DerivedVariable) as DerivedVariable[];
        this.triggeredVariables = this.variables.filter(v => v instanceof TriggeredVariable) as TriggeredVariable[];
    }

    get currentTime() { return this.currentPeriod.time; }

    getPartialState() {
        const observed = this.currentPeriod.toPartialConcreteEndState();
        return new PartialState(this, observed)
    }

    getNextTimePeriod(): TimePeriod | null {
        // Final the minimum time that's greater than the current time
        // or null
        let nextTime: number | null = null;
        for (let t of this.timePeriods.keys()) {
            if (t > this.currentTime && (nextTime === null || t < nextTime)) {
                nextTime = t;
            }
        }
        if (nextTime === null) {
            return null;
        }
        return this.timePeriods.get(nextTime)!;
    }

    set(variable: MutableVariable, value: boolean, observeFirst = true, observeAfter = true) {
        if (observeFirst) {
            this.get(variable)
        }
        this.currentPeriod.variableWasModified(variable, value);
        
        const triggeredPersistentVars = this.getTriggeredVariables(variable).filter(tv => tv.isPersistent);
        // Irreversible mutations and persistent triggered variables cannot be undone
        // so we have to resolve state now
        if (!variable.reversible || triggeredPersistentVars.length > 0) {
            const nextTime = this.getNextTimePeriod();
            if (nextTime) {
                // TODO: The problem is the current logic all operates
                // on the assumption that we're editing the start state of
                // the future destination, but for this we need to edit
                // the start state of the current time period.
                // this.reconcileStateWithFuture(nextTime);
            }
        }
        if (observeAfter) {
            this.currentPeriod.variableWasObserved(variable, value);
        }
        this.checkForTriggeredVariables(variable);
    }

    private shouldVariableTrigger(updatedVariable: Variable, triggered: TriggeredVariable) {
        const currentState = this.getPartialState();
        if (
            triggered.isDependentOn(updatedVariable) &&
            // This should only be true if we know it's already been triggered
            !this.currentPeriod.peekValue(triggered) 
        ) {
            const currentState = this.getPartialState();
            const shouldTrigger = triggered.shouldTrigger(currentState.toConcreteState());
            if (shouldTrigger) {
                return true;
            }
        }
        return false;
    }

    private getTriggeredVariables(updatedVariable: Variable) {
        return this.triggeredVariables.filter(tv => this.shouldVariableTrigger(updatedVariable, tv));
    }

    checkForTriggeredVariables(updatedVariable: Variable) {
        this.getTriggeredVariables(updatedVariable).forEach(tv => {
            // console.log(`Triggered variable ${tv.name} activated at time ${this.currentTime}`);
            this.currentPeriod.variableWasTriggered(tv);
        });
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
        // console.log(state.inspect());
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
        
        const result = this.reconcileStateWithFuture(destination, dryRun);
        if (!dryRun && result) {
            this.currentPeriod = destination;
        }
        return result;
    }

    private reconcileStateWithFuture(destination: TimePeriod, dryRun = false): boolean {
        const time = destination.time;
        const pastState = this.currentPeriod.toPartialConcreteEndState();
        const presentState = destination.toPartialConcreteStartState();
        const mergedState = this.tryMergeStates(pastState, presentState);

        if (!mergedState) {
            console.log(`Cannot travel to time ${time} because of a direct contradiction.`)
            return false;
        }

        const partialState = new PartialState(this, mergedState);
        const consistentState = partialState.findConsistentState();
        console.log(`${dryRun ? "Testing travel" : "Traveling"} to t${time}; reconciling states...`);
        console.log(`Past partial state`, inspectState(pastState));
        console.log('Present partial state', inspectState(presentState));

        if (!consistentState) {
            console.log(`Cannot travel to time ${time} because of a logical contradiction.`)
            return false;
        }
        console.log(consistentState.inspect());

        if (!dryRun) {
            for (let v of this.variables) {
                const oldValue = presentState.get(v);
                const newValue = consistentState.observedValues.get(v);

                if (oldValue !== newValue) {
                    console.log(`Overwriting start state for t${time}/${v.name}: ${oldValue}->${newValue}`);
                    destination.overrideStartState(v, newValue);
                }
            }
        }

        return this.resolveAntecedents(destination, consistentState, dryRun);
    }

    private resolveAntecedents(destination: TimePeriod, consistentState: PartialState, dryRun = false): boolean {
        const time = destination.time;
        for (const [triggered, antecedent] of destination.antecedents.entries()) {
            // Create a hypothetical state at the time of a triggered variable
            let hypotheticalState = consistentState.copy();
            for (const v of this.variables)  {
                if (v === triggered) continue;
                if (triggered.isDependentOn(v)) continue;
                // Ignore anything that is irrelevant to the triggering
                // so we don't encounter contradictions from unrelated observations
                // TODO: This could possible cause some contradictions too...
                hypotheticalState.observedValues.delete(v);
            }
            
            // Theoretically we should be able to find a consistent state here...
            hypotheticalState = hypotheticalState.findConsistentState();
            if (!hypotheticalState) {
                throw Error(`Internal error: Could not reconcile triggered variable ${triggered.name} at time ${time}`);
            }

            for (const [k, v] of antecedent.observedDependencies.entries()) {
                // Some values we observed at the time of triggering,
                // so we set them explicitly
                hypotheticalState.observedValues.set(k, v);
            }
            hypotheticalState.observedValues.set(triggered, true);
            // Important: resolve differences in triggers exactly
            hypotheticalState.resolveMissingTriggers = true;

            // If this works, the trigger didn't cause a contradiction
            // with the default state as we know it.
            if (!hypotheticalState.isDefaultContradictory()) continue;

            // Otherwise, we need to try to reconcile the contradiction
            const resolvedState = hypotheticalState.findConsistentState();
            if (!resolvedState) {
                console.log(`Cannot travel to time ${time} because of a contradiction from triggered variable ${triggered.name}.`)
                return false;
            }

            if (dryRun) continue;

            const originalState = hypotheticalState.observedValues;
            for (const [k, v] of resolvedState.observedValues.entries()) {
                const existingValue = originalState.get(k);
                if (existingValue !== v) {
                    console.log(`Overwriting start state for t${time}/${k.name} due to triggered variable ${triggered.name}: ${existingValue}->${v}`);
                    destination.overrideStartState(k, v);
                }
            }
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
    /** The most recent observed value for this variable, or unknown if currently unobserved. 
     * Only appropriate for MutableVariables where setting is direct.
    */
    currentValue: boolean | undefined,
    /** The last observed value for this variable, or unknown if it could have changed since its last observation. */
    lastObservedValue: boolean | undefined,
}

type TriggeringState = {
    // TODO: I don't think this is needed or possible to accurately track
    // and the incoming partial state contains that info anyway.
    unobservedDependencies: Variable[],
    observedDependencies: ConcreteState,
}

export class TimePeriod {

    private varStates = new Map<Variable, VarState>();
    public readonly antecedents = new Map<TriggeredVariable, TriggeringState>();

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
                currentValue: undefined,
                lastObservedValue: undefined,
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
     * Returns the last observed value for the variable, or a known start value if present. 
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
        state.lastObservedValue = value;
    }

    variableWasModified(modified: MutableVariable | TriggeredVariable, value: boolean) {
        const state = this.varStates.get(modified);
        state.couldHaveBeenModifiedAfterStart = true;
        state.couldHaveBeenModifiedSinceObserved = true;
        state.currentValue = value;
        state.lastObservedValue = value;
        for (let dependent of this.world.variables) {
            if (dependent instanceof DerivedVariable) {
                if (dependent.isDependentOn(modified)) {
                    this.varStates.get(dependent).couldHaveBeenModifiedSinceObserved = true;
                    this.varStates.get(dependent).lastObservedValue = undefined;
                    this.updateCouldHaveBeenObserved(dependent);
                }
            }
        }
    }

    variableWasTriggered(variable: TriggeredVariable) {
        this.variableWasModified(variable, true);
        const unobservedDependencies: Variable[] = [];
        const observedDependencies: ConcreteState = new Map();
        for (let [v, vState] of this.varStates.entries()) {
            if (!variable.isDependentOn(v)) continue;
            // If this variable hasn't been modified and we haven't observed its start value,
            // we don't know its value in the antecedent state
            if (!vState.observedStartValue && !vState.couldHaveBeenModifiedAfterStart) {
                unobservedDependencies.push(v);
                continue;
            }
            // If we haven't observed this variable since it was modified,
            // we can't be sure of its value in the antecedent state
            if (vState.lastObservedValue === undefined) continue;
            observedDependencies.set(v, vState.lastObservedValue);
        }
        this.antecedents.set(variable, {
            unobservedDependencies,
            observedDependencies,
        });
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