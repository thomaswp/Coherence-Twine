function oneline(strings: TemplateStringsArray, ...values: any[]) {
    return strings
        .reduce((result, str, i) => result + str + (i < values.length ? values[i] : ''), '')
        .split('\n')
        .map((line) => line.trimStart())
        .join(' ');
}

interface IVariable {
    readonly name: string;
}

export abstract class Variable<T> implements IVariable {
    // Use the generic parameter so it can be recognized by the TS compiler
    declare readonly _type?: T;

    constructor(public readonly name: string) {}
}

abstract class MutableVariableBase<T> extends Variable<T> {
    constructor(
        name: string,
        public readonly defaultValue: T,
        public readonly reversible = true,
    ) {
        super(name);
    }

    /**
     * Used when binding unobserved variables to search for alternative values.
     * Should return a list of all possible states for this variable.
     */
    abstract possibleStates(): T[];
}

export class MutableBoolean extends MutableVariableBase<boolean> {
    possibleStates(): boolean[] {
        return [true, false];
    }
}

export class MutableNumeric extends MutableVariableBase<number> {
    private readonly possibleStatesArray: number[];

    constructor(
        name: string,
        defaultValue: number,
        public readonly maxValue: number,
    ) {
        super(name, defaultValue);
        this.possibleStatesArray = [];
        for (let i = 0; i <= this.maxValue; i++) {
            this.possibleStatesArray.push(i);
        }
    }

    possibleStates(): number[] {
        return this.possibleStatesArray;
    }

    public static fromProbabilityDistribution(
        name: string,
        probabilities: number[],
    ): MutableNumeric {
        const total = probabilities.reduce((a, b) => a + b, 0);
        if (total <= 0) {
            throw Error('Total probability must be greater than zero');
        }
        const normalized = probabilities.map((p) => p / total);
        let cumulative = 0;
        const rand = Math.random();
        for (let i = 0; i < normalized.length; i++) {
            cumulative += normalized[i];
            if (rand <= cumulative) {
                return new MutableNumeric(name, normalized.length - 1, i);
            }
        }
        // Fallback in case of rounding errors
        return new MutableNumeric(name, normalized.length - 1, normalized.length - 1);
    }
}

export class MutableNominal extends MutableVariableBase<string> {
    constructor(
        name: string,
        public readonly possibleValues: string[],
        defaultValue: string,
    ) {
        super(name, defaultValue);
    }

    possibleStates(): string[] {
        return this.possibleValues;
    }
}

interface DependentVariable {
    isDependentOn(variable: IVariable): boolean;
}

export class DerivedBoolean extends Variable<boolean> implements DependentVariable {
    constructor(
        name: string,
        public readonly dependencies: IVariable[],
        // Allow undefined so we don't have to assert each expected variable
        // exists in the lambda.
        private readonly getValue: (state: ConcreteState) => boolean | undefined,
    ) {
        super(name);
    }

    isDependentOn(variable: IVariable): boolean {
        return this.dependencies.includes(variable);
    }

    deriveValue(state: ConcreteState) {
        const value = this.getValue(state);
        if (value === undefined) {
            throw new Error(`Failed to derive value for variable ${this.name}`);
        }
        return value;
    }
}

export class TriggeredBoolean extends Variable<boolean> implements DependentVariable {
    constructor(
        name: string,
        // Dependencies are mutable or derived
        public readonly dependencies: IVariable[],
        private readonly isTriggered: (state: ConcreteState) => boolean | undefined,
        /**
         * If false, the triggered variable resets to its default value when
         * traveling back in time
         */
        public readonly isPersistent: boolean,
    ) {
        super(name);
    }

    isDependentOn(variable: IVariable): boolean {
        for (let dep of this.dependencies) {
            if (dep === variable) return true;
            if (dep instanceof DerivedBoolean || dep instanceof TriggeredBoolean) {
                if (dep.isDependentOn(variable)) {
                    return true;
                }
            }
        }
        return false;
    }

    shouldTrigger(state: ConcreteState) {
        return this.isTriggered(state)!;
    }
}

function copyMap<Q, P>(map: Map<Q, P>) {
    return new Map<Q, P>(map);
}

class ReadonlyConcreteState {
    protected map = new Map<Variable<any>, any>();

    constructor(entries?: Iterable<[Variable<any>, any]>) {
        if (entries) {
            this.map = new Map<Variable<any>, any>(entries);
        }
    }

    get<T>(key: Variable<T>): T | undefined {
        return this.map.get(key);
    }

    has<T>(key: Variable<T>): boolean {
        return this.map.has(key);
    }

    entries(): IterableIterator<[Variable<any>, any]> {
        return this.map.entries();
    }
}

export class ConcreteState extends ReadonlyConcreteState {
    set<T>(key: Variable<T>, value: T): void {
        this.map.set(key, value);
    }

    delete(variable: IVariable) {
        this.map.delete(variable);
    }

    copy(): ConcreteState {
        const newState = new ConcreteState();
        for (const [key, value] of this.map.entries()) {
            newState.set(key, value);
        }
        return newState;
    }
}

function inspectState(state: ConcreteState | null) {
    if (!state) return null;
    return new Map([...state.entries()].map(([k, v]) => [k.name, v]));
}

export class PartialState {
    protected readonly observedValues: ConcreteState;

    constructor(
        readonly world: World,
        observedValues: ConcreteState = new ConcreteState(),
        /** If true, triggers must match explicitly */
        public resolveMissingTriggers = false,
    ) {
        this.observedValues = observedValues.copy();
    }

    equals(other: PartialState): boolean {
        const thisEntries = [...this.observedValues.entries()];
        const otherEntries = [...other.observedValues.entries()];
        if (thisEntries.length !== otherEntries.length) {
            return false;
        }
        for (let [key, value] of thisEntries) {
            if (!other.observedValues.has(key) || other.observedValues.get(key) !== value) {
                return false;
            }
        }
        return true;
    }

    getObservedValues(): ReadonlyConcreteState {
        return this.observedValues;
    }

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

    findConsistentState(): ConsistentPartialState | null {
        // console.log("Checking for consistency", this.observedValues);
        if (!this.isDefaultContradictory()) return this.asConsistent();

        const mutableVars = this.mutableVariables.filter((mv) => !this.observedValues.has(mv));

        // For each unobserved mutable variable, try each possible value
        // and see if it resolves the contradiction
        for (const mv of mutableVars) {
            const state = this.copy();
            for (const value of mv.possibleStates()) {
                // No point in checking the default value, since we
                // already know that doesn't work
                if (value === mv.defaultValue) continue;
                state.observedValues.set(mv, value);
                // console.log(`Altering ${mv.name} -> ${!mv.defaultValue}`);
                const ps = state.findConsistentState();
                if (ps != null) return ps;
            }
        }
        return null;
    }

    /**
     * Get a value for a variable in the concrete state represented by this partial state.
     * This assumes that the concrete state is consistent and will throw an error otherwise.
     * @param variable
     * @returns
     */
    getConcreteValue<T>(variable: Variable<T>): T {
        if (this.observedValues.has(variable)) {
            return this.observedValues.get(variable)!;
        }
        // This could be more efficient, but that's not really
        // an issue and I like the consistency of not duplicating
        // the calculation.
        const concreteState = this.toConcreteState();
        if (!concreteState) {
            throw Error(
                `Cannot get concrete value for ${variable.name} because of a contradiction`,
            );
        }
        return concreteState.get(variable)!;
    }

    toConcreteState(): ConcreteState | null {
        // Start with observations
        const state = this.observedValues.copy();
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
        return state;
    }

    copy(): PartialState {
        return new PartialState(this.world, this.observedValues, this.resolveMissingTriggers);
    }

    asConsistent(): ConsistentPartialState {
        return new ConsistentPartialState(
            this.world,
            this.observedValues,
            this.resolveMissingTriggers,
        );
    }

    asMutable(): MutablePartialState {
        return new MutablePartialState(
            this.world,
            this.observedValues,
            this.resolveMissingTriggers,
        );
    }

    inspect() {
        return {
            mutableVariables: this.mutableVariables.map((v) => v.name),
            derivedVariables: this.derivedVariables.map((v) => v.name),
            triggeredVariables: this.triggeredVariables.map((v) => v.name),
            observedVariables: inspectState(this.observedValues),
            concreteVariables: inspectState(this.toConcreteState()),
        };
    }
}

export class ConsistentPartialState extends PartialState {
    toConcreteState(): ConcreteState {
        return super.toConcreteState()!;
    }
}

export class MutablePartialState extends PartialState {
    getObservedValues() {
        return this.observedValues;
    }
}

export class World {
    timePeriods = new Map<number, TimePeriod>();
    currentPeriod: TimePeriod;
    public readonly variables: readonly IVariable[];
    public readonly mutableVariables: readonly MutableVariableBase<any>[];
    public readonly derivedVariables: readonly DerivedBoolean[];
    public readonly triggeredVariables: readonly TriggeredBoolean[];

    constructor(variables: IVariable[], currentTime: number = 0) {
        this.variables = variables;
        this.currentPeriod = new TimePeriod(this, currentTime);
        this.timePeriods.set(currentTime, this.currentPeriod);
        this.mutableVariables = this.variables.filter(
            (v) => v instanceof MutableVariableBase,
        ) as MutableVariableBase<any>[];
        this.derivedVariables = this.variables.filter(
            (v) => v instanceof DerivedBoolean,
        ) as DerivedBoolean[];
        this.triggeredVariables = this.variables.filter(
            (v) => v instanceof TriggeredBoolean,
        ) as TriggeredBoolean[];
    }

    get currentTime() {
        return this.currentPeriod.time;
    }

    getPartialState() {
        const observed = this.currentPeriod.toPartialConcreteEndState();
        return new PartialState(this, observed);
    }

    // We assume the only time our current state can fail to resolve
    // into a concrete state is when testing time travel.
    // Otherwise this is a bug and hopefully this will create an error.
    getConcreteState(): ConcreteState {
        const partial = this.getPartialState();
        const state = partial.toConcreteState();
        if (!state) {
            throw Error('Current state is contradictory!');
        }
        return state;
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

    set<T>(variable: MutableVariableBase<T>, value: T, observeFirst = true, observeAfter = true) {
        if (observeFirst) {
            this.get(variable);
        }
        this.currentPeriod.variableWasModified(variable, value);
        if (observeAfter) {
            this.currentPeriod.variableWasObserved(variable, value);
        }

        const triggeredPersistentVars = this.getTriggeredVariables(variable).filter(
            (tv) => tv.isPersistent,
        );
        // Irreversible mutations and persistent triggered variables cannot be undone
        // so we have to resolve state now
        if (!variable.reversible || triggeredPersistentVars.length > 0) {
            const nextTime = this.getNextTimePeriod();
            if (nextTime) {
                // Modify the start state of the *current* time period, since
                // we aren't traveling forward yet.
                // TODO: This shouldn't actually try to reconcile the _whole_ present
                // state; just the part that's irreversible. Otherwise a reversible
                // lever might cause a contradiction unnecessarily.
                this.reconcileStateWithFuture(nextTime, false, false);
            }
        }
        this.checkForTriggeredVariables(variable);
    }

    private shouldVariableTrigger(updatedVariable: IVariable, triggered: TriggeredBoolean) {
        if (
            triggered.isDependentOn(updatedVariable) &&
            // This should only be true if we know it's already been triggered
            !this.currentPeriod.peekValue(triggered)
        ) {
            const shouldTrigger = triggered.shouldTrigger(this.getConcreteState());
            if (shouldTrigger) {
                return true;
            }
        }
        return false;
    }

    private getTriggeredVariables(updatedVariable: IVariable) {
        return this.triggeredVariables.filter((tv) =>
            this.shouldVariableTrigger(updatedVariable, tv),
        );
    }

    checkForTriggeredVariables(updatedVariable: IVariable) {
        this.getTriggeredVariables(updatedVariable).forEach((tv) => {
            // console.log(`Triggered variable ${tv.name} activated at time ${this.currentTime}`);
            this.currentPeriod.variableWasTriggered(tv);
        });
    }

    peek<T>(variable: Variable<T>): T {
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
            throw Error('Unresolvable contradiction!');
        }
        // console.log(state.inspect());
        return state.getConcreteValue(variable);
    }

    // TODO: For non-boolean variables, this current means any
    // observation requires that the exact value is observed, but
    // sometimes you can observe what a value _isn't_ without knowing
    // what it is; there's not way to support that currently. E.g.,
    // you might know a box isn't in a location w/o knowing where it is
    // and that might have some consequences for reconciliation.

    /** Note: Always observes. Use peek for non-observing get. */
    get<T>(variable: Variable<T>): T {
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
            this.timePeriods.set(time, new TimePeriod(this, time));
        }

        const destination = this.timePeriods.get(time)!;
        if (time < this.currentTime) {
            // We assume here that the caller has already checked to prevent the
            // possibility of creating a contradiction, so we don't check for that.
            // There's not really anything else to resolve then.
            this.currentPeriod = destination;
            return true;
        }

        const result = this.reconcileStateWithFuture(destination, dryRun, true);
        if (!dryRun && result) {
            this.currentPeriod = destination;
        }
        return result;
    }

    private reconcileStateWithFuture(
        futurePeriod: TimePeriod,
        dryRun = false,
        modifyFuture: boolean,
    ): boolean {
        const time = futurePeriod.time;
        const currentState = this.currentPeriod.toPartialConcreteEndState();
        const futureState = futurePeriod.toPartialConcreteStartState();

        for (const tv of this.triggeredVariables) {
            if (!tv.isPersistent) {
                // Non-persistent triggered variables shouldn't be carried forward
                currentState.delete(tv);
            }
        }

        const mergedState = this.tryMergeStates(currentState, futureState);

        if (!mergedState) {
            console.log(`Cannot reconcile with time ${time} because of a direct contradiction.`);
            return false;
        }

        const partialState = new PartialState(this, mergedState);
        const consistentStatePreTriggers = partialState.findConsistentState();
        console.log(`### ${dryRun ? 'Testing reconciliation' : 'Reconciling'} with t${time}`);
        console.log(`Present partial state`, inspectState(currentState));
        console.log('Future partial state', inspectState(futureState));

        if (!consistentStatePreTriggers) {
            console.log(`Cannot reconcile with time ${time} because of a logical contradiction.`);
            return false;
        }
        console.log(
            'Found consistent state before triggers:',
            consistentStatePreTriggers.inspect(),
        );

        // The consistent state looks for differences between the end of the past
        // and the start of the future, which need to be reconciled. We can do that
        // the start state of the appropriate time period.
        const stateToVerify = modifyFuture ? futureState : currentState;
        const periodToModify = modifyFuture ? futurePeriod : this.currentPeriod;

        // We resolve antecedents before modifying any states.
        // This means that antecedent modifications happen first

        const consistentState = this.resolveAntecedents(futurePeriod, consistentStatePreTriggers);
        if (!consistentState) {
            // resolveAntecedents already logs the reason
            return false;
        }
        if (!consistentState.equals(consistentStatePreTriggers)) {
            console.log('Found consistent state after triggers:', consistentState.inspect());
        }

        if (!dryRun) {
            for (let v of this.variables) {
                const oldValue = stateToVerify.get(v);
                // TODO: Is this guaranteed to be defined?
                const newValue = consistentState.getObservedValues().get(v)!;

                if (oldValue !== newValue) {
                    // Consider overwriting the start state of the current period if
                    // overriding the future, since the past must carry through
                    // to the future. But only if it hasn't been observed and would not create a
                    // contradiction with the variables that have been observed in the current
                    // start state.
                    if (periodToModify !== this.currentPeriod) {
                        const currentStartState = this.currentPeriod.toPartialConcreteStartState();
                        if (!currentStartState.has(v)) {
                            currentStartState.set(v, newValue);
                            const partialCurrentStart = new PartialState(this, currentStartState);
                            if (!partialCurrentStart.isDefaultContradictory()) {
                                this.currentPeriod.overwriteStartState(v, newValue);
                            }
                        }
                    }
                    periodToModify.overwriteStartState(v, newValue);
                }
            }
        }

        return true;
    }

    private resolveAntecedents(
        destination: TimePeriod,
        consistentState: PartialState,
    ): PartialState | null {
        const time = destination.time;

        let mutableConsistentState = consistentState.asMutable();

        for (const [triggered, antecedent] of destination.antecedents.entries()) {
            // Create a hypothetical state at the time of a triggered variable
            let hypotheticalState = consistentState.asMutable();
            for (const v of this.variables) {
                if (v === triggered) continue;
                if (triggered.isDependentOn(v)) continue;
                // Ignore anything that is irrelevant to the triggering
                // so we don't encounter contradictions from unrelated observations
                // TODO: This could possible cause some contradictions too...
                hypotheticalState.getObservedValues().delete(v);
            }

            // Theoretically we should be able to find a consistent state here...
            const newHypotheticalState = hypotheticalState.findConsistentState();
            if (!newHypotheticalState) {
                throw Error(
                    `Internal error: Could not reconcile triggered variable ${triggered.name} \
                    at time ${time}`,
                );
            }
            hypotheticalState = newHypotheticalState.asMutable();

            for (const [k, v] of antecedent.observedDependencies.entries()) {
                // Some values we observed at the time of triggering,
                // so we set them explicitly
                hypotheticalState.getObservedValues().set(k, v);
            }
            hypotheticalState.getObservedValues().set(triggered, true);
            // Important: resolve differences in triggers exactly
            hypotheticalState.resolveMissingTriggers = true;

            // If this works, the trigger didn't cause a contradiction
            // with the default state as we know it.
            if (!hypotheticalState.isDefaultContradictory()) continue;

            // Otherwise, we need to try to reconcile the contradiction
            const resolvedState = hypotheticalState.findConsistentState();
            if (!resolvedState) {
                console.log(
                    `Cannot travel to time ${time} because of a contradiction from triggered \
                    variable ${triggered.name}.`,
                );
                return null;
            }

            const originalState = hypotheticalState.getObservedValues();
            for (const [k, v] of resolvedState.getObservedValues().entries()) {
                const existingValue = originalState.get(k);
                if (existingValue !== v) {
                    console.log(
                        `Overwriting ${k.name} due to triggered variable ${triggered.name}:\
                        ${existingValue}->${v}`,
                    );
                    // Update the consistent state to include this new observation
                    // (Don't use hypotheticalState; it's had values deleted!)
                    mutableConsistentState.getObservedValues().set(k, v);
                }
            }
        }

        // Could theoretically recurse here, but no need unless there
        // are triggers causing other triggers...
        return mutableConsistentState;
    }

    private tryMergeStates(past: ConcreteState, present: ConcreteState): ConcreteState | null {
        const state = past.copy();
        for (let [key, value] of present.entries()) {
            const lastValue = state.get(key);
            if (lastValue !== undefined && lastValue !== value) {
                console.log(`Failed to merge states: ${key.name} was ${lastValue} now is ${value}`);
                console.log(`Past state`, inspectState(past));
                console.log('Present state', inspectState(present));
                return null;
            }
            state.set(key, value);
        }
        return state;
    }
}

type VarState<T> = {
    // Would be good to actually calculate if it *was* modified but this
    // approach is a good heuristic, is way easier and shouldn't ruin any puzzles
    /** Could this variable have been modified from its starting value? */
    couldHaveBeenModifiedAfterStart: boolean;
    /** Could this variable have been modified since it's last observation? */
    couldHaveBeenModifiedSinceObserved: boolean;
    /** The first value observed for this variable, before any modification, with its starting value. */
    observedStartValue: T | undefined;
    // Pretty much always the regular default value unless traveling forward
    // to a previously unseen time period
    /** A fixed starting value for this variable, if known. */
    startValue: T | undefined;
    /** The most recent observed value for this variable, or unknown if currently unobserved.
     * Only appropriate for MutableVariables where setting is direct.
     */
    currentValue: T | undefined;
    /**
     * The last observed value for this variable, or unknown if it could have changed since its last
     * observation.
     */
    lastObservedValue: T | undefined;
};

type TriggeringState = {
    observedDependencies: ConcreteState;
};

export class TimePeriod {
    private varStates = new Map<IVariable, VarState<any>>();
    public readonly antecedents = new Map<TriggeredBoolean, TriggeringState>();

    private getState(variable: IVariable) {
        return this.varStates.get(variable)!;
    }

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
        startValues: ConcreteState = new ConcreteState(),
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

    /** Overwrite the start state of a variable from its original
     * default value to resolve a contradiction. This should only
     * be used when resolving a contradiction, meaning that the variable
     * should not have been previously observed, nor have we locked in
     * a start value.
     */
    overwriteStartState<T>(variable: Variable<T>, value: T) {
        const state = this.getState(variable);
        if (state.startValue !== undefined) {
            throw Error(
                oneline`Cannot overwrite start state for t${this.time}/${variable.name} to ${value};\
                it is already set to ${state.startValue}`,
            );
        }
        if (state.currentValue !== undefined && state.currentValue !== value) {
            throw Error(
                oneline`Cannot overwrite start state for t${this.time}/${variable.name} to ${value};\
                it is already observed as ${state.currentValue}`,
            );
        }
        console.log(
            oneline`Overwriting start state for t${this.time}/${variable.name}:
                    ${state.startValue}->${value}`,
        );
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
    peekValue<T>(variable: Variable<T>): T | undefined {
        const state = this.getState(variable);
        return state.currentValue ?? state.startValue;
    }

    variableWasObserved<T>(variable: Variable<T>, value: T) {
        const state = this.getState(variable);
        if (!state.couldHaveBeenModifiedAfterStart) state.observedStartValue = value;
        state.couldHaveBeenModifiedSinceObserved = false;
        state.lastObservedValue = value;
    }

    variableWasModified<T>(modified: MutableVariableBase<T> | TriggeredBoolean, value: T) {
        const state = this.getState(modified);
        state.couldHaveBeenModifiedAfterStart = true;
        state.couldHaveBeenModifiedSinceObserved = true;
        state.currentValue = value;
        state.lastObservedValue = value;
        for (let dependent of this.world.variables) {
            if (dependent instanceof DerivedBoolean || dependent instanceof TriggeredBoolean) {
                if (dependent.isDependentOn(modified)) {
                    this.getState(dependent).couldHaveBeenModifiedSinceObserved = true;
                    this.getState(dependent).lastObservedValue = undefined;
                    // TODO: This method just updates couldHaveBeenModifiedSinceObserved,
                    // but we already set that above, and I'm not sure the logic holds, or
                    // is fully compatible with TriggeredVariables...
                    // But the above is too permissive; variables aren't always modified just b/c
                    // a dependency is
                    // this.updateCouldHaveBeenObserved(dependent);
                }
            }
        }
    }

    variableWasTriggered(variable: TriggeredBoolean) {
        this.variableWasModified(variable, true);
        const observedDependencies: ConcreteState = new ConcreteState();
        for (let [v, vState] of this.varStates.entries()) {
            if (!variable.isDependentOn(v)) continue;
            // If this variable hasn't been modified and we haven't observed its start value,
            // we don't know its value in the antecedent state
            if (
                vState.observedStartValue === undefined &&
                !vState.couldHaveBeenModifiedAfterStart
            ) {
                continue;
            }
            // If we haven't observed this variable since it was modified,
            // we can't be sure of its value in the antecedent state
            if (vState.lastObservedValue === undefined) continue;
            observedDependencies.set(v, vState.lastObservedValue);
        }
        this.antecedents.set(variable, {
            observedDependencies,
        });
    }

    // Currently unused and has some problematic assumptions about
    // defaultValue so removing for now...
    // private updateCouldHaveBeenObserved(variable: DerivedVariable) {
    //     let maybeModified = false;
    //     for (let v of variable.dependencies) {
    //         const state = this.getState(v);
    //         const defaultValue = state.startValue ?? v.defaultValue;
    //         if (state.currentValue !== defaultValue) {
    //             maybeModified = true;
    //             break;
    //         }
    //     }
    //     this.getState(variable).couldHaveBeenModifiedAfterStart = maybeModified;
    // }

    toPartialConcreteEndState() {
        const state = new ConcreteState();
        for (let v of this.world.variables) {
            const vState = this.getState(v);
            const value = vState.currentValue;
            if (value !== undefined && !vState.couldHaveBeenModifiedSinceObserved) {
                state.set(v, value);
            } else if (
                !vState.couldHaveBeenModifiedSinceObserved &&
                vState.lastObservedValue !== undefined
            ) {
                state.set(v, vState.lastObservedValue!);
            }
        }
        return state;
    }

    toPartialConcreteStartState() {
        const state = new ConcreteState();
        for (let v of this.world.variables) {
            const vState = this.getState(v);
            if (vState.observedStartValue !== undefined) {
                state.set(v, vState.observedStartValue);
            }
        }
        return state;
    }
}
