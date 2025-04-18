/**
* engine.js
* Core text adventure engine: handles UI, input, command parsing (with structure & abbreviation),
* main game loop, history, initialization, and core state.
* SECURITY NOTE: Uses textContent exclusively for adding game output to prevent XSS.
*/

// --- DOM Elements ---
const outputWindow = document.getElementById('output-window');
const inputBox = document.getElementById('input-box');
const submitButton = document.getElementById('submit-button');

// --- Command History ---
const commandHistory = [];
let historyIndex = 0;
let currentInputBackup = '';

// --- Ponder State ---
let ponderIntervalId = null;
let ponderText = '';
let ponderTickCount = 0;
const PONDER_DELAY = 4000;
const MAX_PONDER_TICKS = 3;

// --- Game State ---
/** @type {GameObject[]} The player's current inventory (items held). */
let playerInventory = [];
/** @type {GameObject[]} Objects currently in the room. */
let roomObjects = [];
/** @type {Object.<string, GameObject|null>} Items currently being worn by the player. */
let wornItems = {}; // Keys should match WEAR_SLOTS constants

// --- NEW: Argument Types for Structured Commands ---
const ARG_TYPES = {
	OBJECT: 'object',       // A general game object
	CONTAINER: 'container', // A game object that can contain others (if implemented)
	KEYWORD: 'keyword',     // A specific required word (e.g., 'set', 'to')
	PREPOSITION: 'preposition', // A specific linking word (e.g., 'in', 'on', 'at')
	INTEGER: 'integer',     // A whole number
	STRING: 'string'        // Any sequence of non-keyword text
};


// --- UPDATED: Command Definitions with Structure ---
// Structure describes the expected arguments *after* the verb.
const commandDefinitions = [
	{
		verb: 'commands',
		aliases: ['help', '?'],
		handler: handleCommandsCommand,
		structure: [] // No arguments needed
	},
	{
		verb: 'drop',
		aliases: [],
		handler: handleDropCommand,
		structure: [
			{ type: ARG_TYPES.OBJECT, name: 'item', source: 'inventory_or_worn' } // Find in inventory or worn
		]
	},
	{
		verb: 'equipment',
		aliases: [],
		handler: handleInventoryCommand, // Reuse inventory command for this
		structure: []
	},
	{
		verb: 'get',
		aliases: ['take'],
		handler: handleGetCommand,
		structure: [
			{ type: ARG_TYPES.OBJECT, name: 'item', source: 'room' } // Find only in the room
		]
	},
	{
		verb: 'inventory',
		aliases: ['i', 'inv', 'equipment'],
		handler: handleInventoryCommand,
		structure: []
	},
	{
		verb: 'look',
		aliases: ['l'],
		handler: null, // Special handling remains in parser
		structure: null // Indicates special handling needed
	},
	{
		verb: 'ponder',
		aliases: [],
		handler: handlePonderCommand,
		structure: [ // Example: Allows "ponder lost key"
			{ type: ARG_TYPES.STRING, name: 'topic', consumeAll: true } // Consume remaining words
		]
	},
	{
		verb: 'remove',
		aliases: ['rem'],
		handler: handleRemoveCommand,
		structure: [
			{ type: ARG_TYPES.OBJECT, name: 'item', source: 'worn' } // Find only worn items
		]
	},
	{
		verb: 'say',
		aliases: [],
		handler: handleSayCommand,
		structure: [ // Allows "say hello world"
			{ type: ARG_TYPES.STRING, name: 'message', consumeAll: true } // Consume remaining words
		]
	},
	{
		verb: 'wear',
		aliases: [],
		handler: handleWearCommand,
		structure: [
			{ type: ARG_TYPES.OBJECT, name: 'item', source: 'inventory' } // Find only in inventory
		]
	},
	// --- Example structure for 'put' (if you were to add it) ---
	/*
	{
	verb: 'put',
	aliases: ['place', 'store'],
	handler: handlePutCommand, // You would need to create this handler
	structure: [
	{ type: ARG_TYPES.OBJECT, name: 'item', source: 'inventory' },
	{ type: ARG_TYPES.PREPOSITION, keywords: ['in', 'into', 'on', 'onto'] },
	{ type: ARG_TYPES.CONTAINER, name: 'container', source: 'any' } // Find container anywhere
	]
	},
	*/
	// --- Example structure for 'edit' (if you were to add it) ---
	/*
	{
	verb: 'edit',
	handler: handleEditCommand, // You would need to create this handler
	structure: [
	{ type: ARG_TYPES.OBJECT, name: 'target', source: 'any'},
	{ type: ARG_TYPES.KEYWORD, keywords: ['set'] },
	{ type: ARG_TYPES.STRING, name: 'valueName' }, // Or KEYWORD if restricted
	{ type: ARG_TYPES.PREPOSITION, keywords: ['to'] },
	{ type: ARG_TYPES.INTEGER, name: 'newValue' } // Could be STRING too
	]
	}
	*/
];

// --- Utility Functions ---
// (escapeHtml not needed)

// --- Output Window Functions ---
/**
* Adds text to the output window safely using textContent and scrolls down.
*/
function addOutput(content, className) {
	const paragraph = document.createElement('p');
	paragraph.textContent = content;
	if (className) {
		paragraph.classList.add(className);
	}
	outputWindow.appendChild(paragraph);
	scrollToBottom();
}
/** Clears the output window. */
function clearOutput() {
	outputWindow.innerHTML = '';
}
/** Scrolls the output window to the bottom. */
function scrollToBottom() {
	requestAnimationFrame(() => {
		outputWindow.scrollTop = outputWindow.scrollHeight;
	});
}

// --- Input Handling ---
/** Stops the current pondering action, if any. */
function stopPondering(manualStop = false) {
	if (ponderIntervalId !== null) {
		clearInterval(ponderIntervalId);
		if (manualStop) {
			addOutput(`You stop thinking about ${ponderText}.`);
		}
		ponderIntervalId = null;
		ponderText = '';
		ponderTickCount = 0;
	}
}
/** Handles command submission. */
function processInput() {
	stopPondering(true);
	const inputText = inputBox.value.trim();
	if (inputText === '') {
		inputBox.focus();
		return;
	}
	addOutput("\u00A0"); // Add a non-breaking space to force an empty line
	addOutput(`> ${inputText}`, 'player-command');
	if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== inputText) {
		commandHistory.push(inputText);
	}
	historyIndex = commandHistory.length;
	currentInputBackup = '';
	
	// --- NEW: Call refactored parser ---
	parseAndExecuteCommand(inputText);
	
	inputBox.value = '';
	triggerInputEvent();
	setTimeout(() => { inputBox.focus(); }, 0);
}
/** Adjusts textarea height based on content. */
function autoResizeTextarea() {
	if (!inputBox) return;
	inputBox.style.height = 'auto';
	inputBox.style.height = `${inputBox.scrollHeight}px`;
}
/** Manually triggers the 'input' event for resizing. */
function triggerInputEvent() {
	inputBox.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
}

// --- Event Listeners ---
// (Submit button, keydown, input listeners remain largely the same as before)
submitButton.addEventListener('click', processInput);
inputBox.addEventListener('keydown', (event) => {
	const currentInput = inputBox.value;
	const isFullySelected = inputBox.selectionStart === 0 && inputBox.selectionEnd === currentInput.length;
	
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		processInput();
	} else if (event.key === 'ArrowUp') {
		event.preventDefault();
		let searchPrefix = '';
		if (historyIndex < commandHistory.length) {
			searchPrefix = currentInputBackup;
		} else {
			currentInputBackup = currentInput;
			searchPrefix = currentInput;
		}
		let foundMatch = false;
		for (let i = historyIndex - 1; i >= 0; i--) {
			if (commandHistory[i].toLowerCase().startsWith(searchPrefix.toLowerCase())) {
				inputBox.value = commandHistory[i];
				historyIndex = i;
				setTimeout(() => { inputBox.select(); triggerInputEvent(); }, 0);
				foundMatch = true;
				break;
			}
		}
		if (!foundMatch) playBeep();
		
	} else if (event.key === 'ArrowDown') {
		event.preventDefault();
		let searchPrefix = '';
		if (historyIndex < commandHistory.length) {
			searchPrefix = currentInputBackup;
		} else {
			playBeep();
			return;
		}
		let foundMatch = false;
		for (let i = historyIndex + 1; i < commandHistory.length; i++) {
			if (commandHistory[i].toLowerCase().startsWith(searchPrefix.toLowerCase())) {
				inputBox.value = commandHistory[i];
				historyIndex = i;
				setTimeout(() => { inputBox.select(); triggerInputEvent(); }, 0);
				foundMatch = true;
				break;
			}
		}
		if (!foundMatch && historyIndex < commandHistory.length) {
			historyIndex = commandHistory.length;
			inputBox.value = currentInputBackup;
			setTimeout(() => { inputBox.select(); triggerInputEvent(); }, 0);
		} else if (!foundMatch) {
			playBeep();
		}
	}
});
inputBox.addEventListener('input', (event) => {
	autoResizeTextarea();
	if (event.isTrusted) {
		historyIndex = commandHistory.length;
		currentInputBackup = '';
	}
});


// --- REFACTORED Command Parser ---
/**
* Finds the command definition matching the input verb/alias.
* @param {string} verb - The first word of the user input (lowercase).
* @returns {object | null} The matching command definition or null.
*/
function findCommandDefinition(verb) {
	if (!verb) return null;
	for (const cmdDef of commandDefinitions) {
		const aliases = Array.isArray(cmdDef.aliases) ? cmdDef.aliases : [];
		const match = cmdDef.verb.startsWith(verb) || aliases.some(alias => alias.startsWith(verb));
		if (match) {
			return cmdDef;
		}
	}
	return null;
}

/**
* Parses the command based on structured definitions and executes it.
* @param {string} commandString - The full command input by the user.
*/
function parseAndExecuteCommand(commandString) {
	const parts = commandString.trim().split(/\s+/);
	const verb = parts[0]?.toLowerCase();
	let args = parts.slice(1); // Remaining words as potential arguments
	
	if (!verb) return; // Empty input
	
	const cmdDef = findCommandDefinition(verb);
	
	if (!cmdDef) {
		addOutput(`I don't understand how to "${verb}". Try COMMANDS for a list.`);
		return;
	}
	
	// --- Special Handling for 'look' (Remains necessary) ---
	if (cmdDef.verb === 'look') {
		const isLookAtThing = args.length > 0 &&
		args[0].toLowerCase() !== 'self' &&
		!(args[0].toLowerCase() === 'at' && args[1]?.toLowerCase() === 'self');
		
		if (isLookAtThing) {
			// Delegate 'look at <thing>' parsing to a specific structure or handler
			// For simplicity here, we'll manually simulate a structure for 'look at'
			const lookAtStructure = [
				{ type: ARG_TYPES.PREPOSITION, keywords: ['at'], optional: true }, // Allow 'look at' or 'look'
				{ type: ARG_TYPES.OBJECT, name: 'item', source: 'any' }
			];
			// We need to adjust args if 'at' is present
			if (args[0]?.toLowerCase() === 'at') {
				args = args.slice(1); // Remove 'at' for the object matching
			}
			// Now, attempt to parse using the structure (reusing the main logic)
			const parseResult = parseArguments(args, lookAtStructure);
			if (parseResult.success && typeof handleLookAtCommand === 'function') {
				handleLookAtCommand(parseResult.parsedArgs);
			} else {
				// Handle parsing failure or missing handler
				addOutput(parseResult.error || "Look at what exactly?");
			}
			
		} else {
			// 'look' or 'look [at] self'
			if (typeof handleLookRoomCommand === 'function') {
				// handleLookRoomCommand might need adjustment if it expects specific args
				// For now, passing the raw remaining args (like ['self'] or ['at', 'self'])
				handleLookRoomCommand(args);
			} else {
				console.error("handleLookRoomCommand function not found!");
				addOutput("Error handling 'look'.");
			}
		}
		return; // Handled 'look' variations
	}
	
	// --- General Command Handling with Structures ---
	if (!cmdDef.handler) {
		console.error(`Command definition for "${cmdDef.verb}" has no handler.`);
		addOutput("Something went wrong with that command definition.");
		return;
	}
	
	if (!cmdDef.structure) {
		// Should not happen for commands other than 'look' based on current defs
		console.error(`Command definition for "${cmdDef.verb}" is missing structure.`);
		addOutput(`I'm confused about how to "${cmdDef.verb}".`);
		return;
	}
	
	if (cmdDef.structure.length === 0) {
		// Command takes no arguments
		if (args.length > 0) {
			addOutput(`The "${cmdDef.verb}" command doesn't need anything after it.`);
			return;
		}
		cmdDef.handler({}); // Call handler with empty object
	} else {
		// Command expects arguments, parse them according to the structure
		const parseResult = parseArguments(args, cmdDef.structure);
		
		if (parseResult.success) {
			cmdDef.handler(parseResult.parsedArgs); // Pass structured args
		} else {
			addOutput(parseResult.error || `I didn't understand that command. Try "COMMANDS".`);
		}
	}
}


/**
* Attempts to parse the input arguments based on the command's structure definition.
* @param {string[]} inputArgs - The array of words following the verb.
* @param {object[]} structure - The structure definition from commandDefinitions.
* @returns {{success: boolean, parsedArgs: object, error?: string}}
*/
function parseArguments(inputArgs, structure) {
	const parsedArgs = {};
	let currentArgIndex = 0;
	
	for (const structItem of structure) {
		const remainingArgs = inputArgs.slice(currentArgIndex);
		if (remainingArgs.length === 0 && !structItem.optional) {
			// Check if previous item consumed everything
			if (structItem.type === ARG_TYPES.PREPOSITION || structItem.type === ARG_TYPES.KEYWORD) {
				return { success: false, parsedArgs: {}, error: `I expected '${structItem.keywords[0]}' after the previous word.` };
			} else {
				return { success: false, parsedArgs: {}, error: `What do you want to ${structItem.type}?` }; // Generic, improve if needed
			}
		}
		
		const currentWord = remainingArgs[0]?.toLowerCase();
		
		switch (structItem.type) {
			case ARG_TYPES.OBJECT:
			case ARG_TYPES.CONTAINER: // Treat container like object for finding
			// Try to find the object using subsequent words until a non-match or keyword
			let wordsForObject = [];
			let consumedCount = 0;
			let foundObject = null;
			
			for (let i = 0; i < remainingArgs.length; i++) {
				wordsForObject.push(remainingArgs[i].toLowerCase());
				// Call the updated findObject function (needs implementation in objects.js)
				foundObject = findObject(wordsForObject, structItem.source);
				if (foundObject) {
					consumedCount = i + 1;
					break; // Found best match with these words
				}
				// Optional: Could add logic here to stop if the next word matches a *later*
				// structure item (like a PREPOSITION), to prevent over-consuming.
			}
			
			if (foundObject) {
				parsedArgs[structItem.name] = foundObject;
				currentArgIndex += consumedCount;
			} else {
				const typeName = structItem.type === ARG_TYPES.CONTAINER ? 'container' : 'thing';
				return { success: false, parsedArgs: {}, error: `I don't see any ${typeName} called "${remainingArgs.join(' ')}" ${getSourceLocationText(structItem.source)}.` };
			}
			break;
			
			case ARG_TYPES.KEYWORD:
			case ARG_TYPES.PREPOSITION:
			const expectedKeywords = structItem.keywords.map(k => k.toLowerCase());
			if (expectedKeywords.includes(currentWord)) {
				// If the type has a 'name', store the matched keyword. Useful? Maybe not often.
				if (structItem.name) {
					parsedArgs[structItem.name] = currentWord;
				}
				currentArgIndex++;
			} else if (!structItem.optional) {
				return { success: false, parsedArgs: {}, error: `I expected '${expectedKeywords[0]}' there, not '${currentWord}'.` };
			}
			// If optional and not found, do nothing, consume no args.
			break;
			
			case ARG_TYPES.INTEGER:
			const parsedInt = parseInt(currentWord);
			if (!isNaN(parsedInt)) {
				parsedArgs[structItem.name] = parsedInt;
				currentArgIndex++;
			} else if (!structItem.optional) {
				return { success: false, parsedArgs: {}, error: `I expected a number there, not '${currentWord}'.` };
			}
			break;
			
			case ARG_TYPES.STRING:
			if (structItem.consumeAll) {
				// Consume all remaining arguments
				if (remainingArgs.length > 0) {
					parsedArgs[structItem.name] = remainingArgs.join(' ');
					currentArgIndex += remainingArgs.length;
				} else if (!structItem.optional) {
					return { success: false, parsedArgs: {}, error: `What ${structItem.name} are you talking about?` };
				}
			} else {
				// Consume just the next word as a string
				parsedArgs[structItem.name] = currentWord; // Keep original case? Maybe inputArgs[currentArgIndex]
				currentArgIndex++;
			}
			break;
			
			default:
			console.error(`Unknown structure type: ${structItem.type}`);
			return { success: false, parsedArgs: {}, error: "Internal error: Unknown command structure." };
		}
	}
	
	// After checking all structure items, are there unused input arguments?
	if (currentArgIndex < inputArgs.length) {
		return { success: false, parsedArgs: {}, error: `I didn't understand the extra part: "${inputArgs.slice(currentArgIndex).join(' ')}".` };
	}
	
	
	return { success: true, parsedArgs: parsedArgs };
}

/** Helper to get readable location text for error messages */
function getSourceLocationText(source) {
	switch(source) {
		case 'inventory': return 'in your inventory';
		case 'room': return 'here';
		case 'worn': return 'that you are wearing';
		case 'any': return 'around';
		case 'inventory_or_worn': return 'in your inventory or that you are wearing';
		default: return 'around';
	}
}


// --- Commands Handler ---
// (handleCommandsCommand remains the same as before)
/** Handles the 'commands' command, listing available commands safely as text. */
function handleCommandsCommand() {
	const commandsList = [
		// This list needs to be manually maintained and aligned with definitions
		{ syntax: 'COMMANDS',         description: 'List all available commands (aliases: help, ?).' },
		{ syntax: 'DROP <item>',        description: 'Put down an item from your inventory or that you are wearing.' },
		{ syntax: 'EQUIPMENT',        description: 'List items you are currently wearing.' }, // Implicitly handled by INVENTORY
		{ syntax: 'GET <item>',         description: 'Pick up an item from the room (alias: take).' },
		{ syntax: 'INVENTORY',        description: 'List items you are carrying and wearing (aliases: i, inv).' },
		{ syntax: 'LOOK',             description: 'Describe the room, items, and exits (alias: l).' },
		{ syntax: 'LOOK AT <thing>',    description: 'Examine an item or feature more closely.' },
		{ syntax: 'LOOK [at] SELF',   description: 'Describe yourself and what you are wearing.' },
		{ syntax: 'PONDER <topic>',     description: 'Think about a topic for a while.' },
		{ syntax: 'REMOVE <item>',      description: 'Take off an item you are wearing (alias: rem).' },
		{ syntax: 'SAY <message>',      description: 'Speak the message out loud.' },
		{ syntax: 'WEAR <item>',        description: 'Put on an item from your inventory.' },
		// Add descriptions for PUT, EDIT etc. if implemented
	];
	commandsList.sort((a, b) => a.syntax.localeCompare(b.syntax));
	let maxSyntaxLength = 0;
	commandsList.forEach(cmd => {
		if (cmd.syntax.length > maxSyntaxLength) {
			maxSyntaxLength = cmd.syntax.length;
		}
	});
	const minPadding = 3;
	const paddingChar = '\u00A0'; // Non-breaking space
	let outputLines = ["Available Commands:"];
	commandsList.forEach(cmd => {
		const paddingNeeded = Math.max(minPadding, maxSyntaxLength - cmd.syntax.length + minPadding);
		const padding = paddingChar.repeat(paddingNeeded);
		outputLines.push(`${cmd.syntax}${padding}${cmd.description}`);
	});
	const formattedOutput = outputLines.join('\n');
	addOutput(formattedOutput);
}


// --- Initialization ---
/** Initializes the game state and client. */
function initializeGame() {
	if (!outputWindow || !inputBox || !submitButton) {
		console.error("Initialization failed: Required DOM elements not found.");
		alert("Error: Could not find essential game elements. Check the HTML file.");
		return;
	}
	playerInventory = [];
	if (typeof GameObject === 'undefined') {
		console.error("Initialization failed: GameObject class not found. Check script loading order in HTML.");
		alert("Error: Game object definition missing. Check console.");
		roomObjects = [];
	} else {
		roomObjects = [
			new GameObject('lantern1', 'an iron lantern', ['iron', 'lantern', 'lamp'], 'An iron lantern has been set here.'),
			new GameObject('key2', 'a rusty key', ['rusty', 'key'], 'A rusty key lies on the floor.'),
			new GameObject('mail1','a chainmail hauberk',['chainmail', 'hauberk', 'mail', 'armor'],'A chainmail hauberk rests on a dusty crate.',true,'torso')
		];
	}
	wornItems = {};
	if (typeof WEAR_SLOTS !== 'undefined' && Array.isArray(WEAR_SLOTS)) {
		for (const slot of WEAR_SLOTS) {
			wornItems[slot] = null;
		}
	} else {
		console.error("WEAR_SLOTS constant not found or not an array during initialization! Check objects.js.");
		alert("Error: Wear slots configuration missing. Check console.");
	}
	historyIndex = commandHistory.length;
	currentInputBackup = '';
	stopPondering();
	
	clearOutput();
	addOutput("Welcome to Lucien's Text Game Prototyper!");
	addOutput("Type COMMANDS for a list of commands.");
	addOutput("\u00A0"); // Add a non-breaking space to force an empty line
	
	if (typeof handleLookRoomCommand === 'function') {
		// Assuming handleLookRoomCommand doesn't need args for initial look
		handleLookRoomCommand([]);
	} else {
		console.error("handleLookRoomCommand function not found! Check commands.js and HTML script order.")
		addOutput("Error: Cannot describe the starting location.");
	}
	inputBox.value = '';
	inputBox.focus();
	autoResizeTextarea();
}

// --- Start Game ---
document.addEventListener('DOMContentLoaded', initializeGame);