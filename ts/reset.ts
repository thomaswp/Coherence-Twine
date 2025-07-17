
function gameInit() {
	const defaultMap = {
		"time": 0,
	}
    const avoidInfoMap = {
        "isDoorLocked": true,
    };
	const booleanMap = {
		"isLever1Locked": false,
	}

	const levelMap = {
		"Boolean": booleanMap,
		"AvoidInfo": avoidInfoMap,
	}
	const levelVars = levelMap[State.variables["persistLevel"]] || {};

	const initMap = {
		...defaultMap,
		...levelVars,
	};
	for (const key in initMap) {
        State.variables[key] = initMap[key];
    }
}


function getPreservedVars() {
	const out = {};
	for (const key in State.variables) {
		if (key.startsWith("persist")) {
			out[key] = State.variables[key];
		}
	}
	return out;
}

function softReset() {
	// Cache preserved values
	const preserved = getPreservedVars();

	// Replace entire variable store
	for (const key in State.variables) {
		delete State.variables[key]
	}

	// Restore preserved values
	for (const key in preserved) {
		State.variables[key] = preserved[key];
	}

	// Re-run init
	gameInit();

	// Optionally go to a specific passage
	Engine.play(State.variables["persistResetRoom"]);
}

Macro.add("soft-reset", {
	handler() {
		softReset();
	}
});

Macro.add("init-vars", {
    handler() {
        gameInit();
    }
});