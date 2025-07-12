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