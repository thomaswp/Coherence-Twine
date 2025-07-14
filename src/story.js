Config.saves.maxAutoSaves = 1;

let hasLoaded = false;

// Auto-save after each passage
$(document).on(':passagerender', function () {
    if (!hasLoaded) return;
	Save.browser.auto.save("Autosave");
    // console.log("save");
});

// Auto-load the autosave if it exists
$(document).on(':storyready', function () {
    console.log("ready");
	if (Save.browser.auto.size > 0) {
        // console.log("continue");
		Save.browser.continue();
	}
    hasLoaded = true;
});

function gameInit() {
	State.variables.isDoorLocked = true;
    State.variables.time = 0;
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
	Engine.play("Entryway");
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
