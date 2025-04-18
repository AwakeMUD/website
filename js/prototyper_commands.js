/**
 * commands.js
 * Handles general game commands like looking around, saying, pondering.
 * Assumes core engine functions/variables are global.
 * Accepts parsedArgs object from the new parser.
 */

// --- General Command Handlers ---

/** Handles the 'LOOK' command for room description and looking at self (Updated). */
function handleLookRoomCommand(args) {
	// NOTE: See previous comment about potential arg types for 'look'
	const arg1 = args[0]?.toLowerCase();
    const arg2 = args[1]?.toLowerCase();

	// Case 1: look self / look at self
	if (arg1 === 'self' || (arg1 === 'at' && arg2 === 'self')) {
		// Output main description
		addOutput("You take stock of yourself. You're clad in well-worn leather armor, scuffed from recent travels. A sturdy backpack rests on your shoulders."); // Separate paragraph

		// --- Combine "You are wearing:" and items into ONE block ---
		let wearingSomething = false;
		// Initialize the string *with the heading*
		let wornItemsOutput = "You are wearing:";

		for (const slot of WEAR_SLOTS) {
			const item = wornItems[slot];
			if (item) {
				// Append each item with a preceding newline
				wornItemsOutput += `\n- ${item.shortName} (on your ${slot})`;
				wearingSomething = true;
			}
		}

		if (!wearingSomething) {
			// If nothing worn, append the message to the heading string
			wornItemsOutput += "\n- Nothing notable.";
		}

		// Add the complete block (heading + list or heading + "nothing") as one paragraph
		addOutput(wornItemsOutput);

		// Output concluding sentence
		addOutput("You feel a mix of apprehension and determination."); // Separate paragraph
	}
	// Case 2: look (general room description)
	else {
		// Output the main room description as its own paragraph
		addOutput("You are in a dimly lit, moss-covered stone chamber. Water drips steadily from the ceiling into a murky puddle near the west wall. A heavy, iron-banded wooden door stands to the north. The air is cool and smells of damp earth.");

		// Combine "You also see:" and items into ONE block
		if (roomObjects && roomObjects.length > 0) {
			let itemsOutput = "You also see:";
			roomObjects.forEach(obj => {
				itemsOutput += `\n- ${obj.roomDesc}`;
			});
			addOutput(itemsOutput);
		}
	}
}

/** Handles the 'SAY' command. Expects { message: string } */
// ... (handleSayCommand remains the same as the previous fix)
function handleSayCommand(parsedArgs) {
	const message = parsedArgs.message;
	if (!message || message.trim() === '') {
		addOutput("What do you want to say?");
	} else {
		addOutput(`You say, "${message}"`);
	}
}


/** Handles the 'PONDER' command. Expects { topic: string } */
// ... (handlePonderCommand remains the same as the previous fix)
function handlePonderCommand(parsedArgs) {
	if (ponderIntervalId !== null) {
		addOutput(`You are already thinking about ${ponderText}.`);
		return;
	}
	const topic = parsedArgs.topic;
	if (!topic || topic.trim() === '') {
		addOutput("What do you want to ponder?");
		return;
	}
	ponderText = topic;
	ponderTickCount = 0;
	addOutput(`You start thinking about ${ponderText}...`);
	ponderIntervalId = setInterval(() => {
		ponderTickCount++;
		if (ponderTickCount < MAX_PONDER_TICKS) {
			addOutput(`You keep thinking about ${ponderText}...`);
		} else if (ponderTickCount === MAX_PONDER_TICKS) {
			addOutput(`You conclude your thoughts on ${ponderText}.`);
			stopPondering(false);
		} else {
			console.warn("Ponder interval ran past max ticks.");
			stopPondering(false);
		}
	}, PONDER_DELAY);
}