// --- DOM Elements ---
const outputWindow = document.getElementById('output-window');
const inputBox = document.getElementById('input-box');
const submitButton = document.getElementById('submit-button');

// --- Command History ---
const commandHistory = [];
let historyIndex = 0;
let currentInputBackup = '';

// --- Ponder State ---
let ponderIntervalId = null; // Stores the ID from setInterval
let ponderText = '';         // Stores the text being pondered
let ponderTickCount = 0;     // Counts how many times the interval has run
const PONDER_DELAY = 4000;   // Delay in milliseconds (e.g., 4 seconds)
const MAX_PONDER_TICKS = 3;  // Number of interval executions before auto-stopping

// --- Web Audio API for Beep ---
let audioContext;
function playBeep() {
	try {
		if (!audioContext) {
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
		}
		if (audioContext.state === 'suspended') {
			audioContext.resume();
		}
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);
		gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
		gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1);
		oscillator.type = 'sine';
		oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
		oscillator.start(audioContext.currentTime);
		oscillator.stop(audioContext.currentTime + 0.1);
	} catch (e) {
		console.error("Web Audio API beep failed:", e);
	}
}


// --- Output Window Functions ---
/** Adds text to the output window and scrolls down. */
function addOutput(text, className) {
	const paragraph = document.createElement('p');
	paragraph.innerHTML = text;
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
	outputWindow.scrollTop = outputWindow.scrollHeight;
}

// --- Input Handling ---

/**
* Stops the current pondering action, if any, and resets state.
* Prints the interruption message ONLY if stopped manually (not self-terminated).
* @param {boolean} manualStop - Flag indicating if stopped by user input vs self-termination.
*/
function stopPondering(manualStop = false) {
	if (ponderIntervalId !== null) {
		clearInterval(ponderIntervalId); // Stop the interval
		if (manualStop) {
			// Only show "You stop thinking..." if interrupted by user
			addOutput(`You stop thinking about ${ponderText}.`);
		}
		// Reset state regardless of how it stopped
		ponderIntervalId = null;
		ponderText = '';
		ponderTickCount = 0; // Reset tick count
	}
}

/** Handles command submission. */
function processInput() {
	// Stop any active pondering *before* processing the new command
	// Pass 'true' to indicate this is a manual interruption
	stopPondering(true);
	
	const inputText = inputBox.value.trim();
	
	if (inputText === '') {
		inputBox.focus();
		return;
	}
	
	addOutput(`> ${inputText}`, 'player-command');
	
	if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== inputText) {
		commandHistory.push(inputText);
	}
	historyIndex = commandHistory.length;
	currentInputBackup = '';
	
	parseCommand(inputText);
	
	setTimeout(() => {
		inputBox.focus();
		inputBox.select();
	}, 0);
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


// --- Event Listeners --- (Remain the same as previous version)

// Submit on button click
submitButton.addEventListener('click', processInput);

// Handle keydown for Enter, ArrowUp, ArrowDown
inputBox.addEventListener('keydown', (event) => {
	const currentInput = inputBox.value;
	const isFullySelected = inputBox.selectionStart === 0 && inputBox.selectionEnd === currentInput.length && currentInput.length > 0;
	
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		processInput();
		
	} else if (event.key === 'ArrowUp') {
		event.preventDefault();
		let searchIndex = historyIndex - 1;
		let prefix = '';
		if (!isFullySelected || historyIndex === commandHistory.length) {
			prefix = currentInput;
			searchIndex = commandHistory.length - 1;
			if (historyIndex === commandHistory.length) {
				currentInputBackup = currentInput;
			}
		} else {
			prefix = currentInputBackup;
		}
		let foundMatch = false;
		for (let i = searchIndex; i >= 0; i--) {
			if (commandHistory[i].startsWith(prefix)) {
				inputBox.value = commandHistory[i];
				historyIndex = i;
				setTimeout(() => {
					inputBox.select();
					triggerInputEvent();
				}, 0);
				foundMatch = true;
				break;
			}
		}
		if (!foundMatch) playBeep();
		
	} else if (event.key === 'ArrowDown') {
		event.preventDefault();
		let searchIndex = historyIndex + 1;
		let prefix = '';
		if (!isFullySelected || historyIndex === commandHistory.length) {
			if (historyIndex === commandHistory.length) {
				playBeep();
				return;
			}
			prefix = currentInput;
		} else {
			prefix = currentInputBackup;
		}
		let foundMatch = false;
		for (let i = searchIndex; i < commandHistory.length; i++) {
			if (commandHistory[i].startsWith(prefix)) {
				inputBox.value = commandHistory[i];
				historyIndex = i;
				setTimeout(() => {
					inputBox.select();
					triggerInputEvent();
				}, 0);
				foundMatch = true;
				break;
			}
		}
		if (!foundMatch && historyIndex < commandHistory.length) {
			historyIndex = commandHistory.length;
			inputBox.value = currentInputBackup;
			setTimeout(() => {
				inputBox.select();
				triggerInputEvent();
			}, 0);
			playBeep();
		} else if (!foundMatch) {
			playBeep();
		}
	}
});


// Auto-resize textarea on input AND reset history navigation state
inputBox.addEventListener('input', (event) => {
	autoResizeTextarea();
	if (event.isTrusted) {
		historyIndex = commandHistory.length;
		currentInputBackup = '';
	}
});


// --- Simple Game Engine ---
/** Parses the user's command string and executes the corresponding action. */
function parseCommand(commandString) {
	const parts = commandString.toLowerCase().trim().split(/\s+/);
	const verb = parts[0];
	const args = parts.slice(1);
	
	switch (verb) {
		case 'look':
		handleLookCommand(args);
		break;
		case 'say':
		handleSayCommand(args);
		break;
		case 'ponder':
		handlePonderCommand(args);
		break;
		default:
		// No need to call stopPondering here, processInput already did
		addOutput(`I don't understand how to "${verb}". Try commands like LOOK, SAY, PONDER, etc.`);
		break;
	}
}

/** Handles the different variations of the 'LOOK' command. */
function handleLookCommand(args) {
	if (args.length === 0) {
		addOutput("You are in a dimly lit, moss-covered stone chamber. Water drips steadily from the ceiling into a murky puddle near the west wall. A heavy, iron-banded wooden door stands to the north. The air is cool and smells of damp earth.");
	} else if ((args[0] === 'at' && args[1] === 'self') || args[0] === 'self') {
		addOutput("You take stock of yourself. You're clad in well-worn leather armor, scuffed from recent travels. A sturdy backpack rests on your shoulders, containing essentials (you hope). You feel a mix of apprehension and determination.");
	} else {
		const target = args[0] === 'at' ? args.slice(1).join(' ') : args.join(' ');
		addOutput(`You look ${args[0] === 'at' ? 'at' : 'towards'} the ${target}, but can't make out any details yet.`);
	}
}

/** Handles the 'SAY' command. */
function handleSayCommand(args) {
	if (args.length === 0) {
		addOutput("What do you want to say?");
	} else {
		const message = args.join(' ');
		addOutput(`You say, "${message}"`);
	}
}

/** Handles the 'PONDER' command, now with self-termination. */
function handlePonderCommand(args) {
	if (ponderIntervalId !== null) {
		addOutput(`You are already thinking about ${ponderText}.`);
		return;
	}
	if (args.length === 0) {
		addOutput("What do you want to ponder?");
		return;
	}
	
	ponderText = args.join(' ');
	ponderTickCount = 0; // Initialize tick count for this ponder session
	addOutput(`You start thinking about ${ponderText}...`);
	
	// Start the repeating interval
	ponderIntervalId = setInterval(() => {
		ponderTickCount++; // Increment counter *before* check
		
		// Use <= MAX_PONDER_TICKS if you want the final message to appear *after* the last tick
		// Use < MAX_PONDER_TICKS if you want exactly MAX_PONDER_TICKS total messages including "start"
		if (ponderTickCount < MAX_PONDER_TICKS) {
			// Normal "keep thinking" message
			addOutput(`You keep thinking about ${ponderText}...`);
		} else if (ponderTickCount === MAX_PONDER_TICKS) {
			// Last tick: print concluding message and stop
			addOutput(`You conclude your thoughts on ${ponderText}.`);
			stopPondering(false); // Auto-stop, pass 'false' for manualStop flag
		} else {
			// Safety net - should not be reached if logic is correct
			console.info("Ponder interval ran unexpectedly past MAX_PONDER_TICKS.");
			stopPondering(false);
		}
		
	}, PONDER_DELAY);
}


// --- Initialization ---
/** Initializes the game client when the page loads. */
function initializeGame() {
	if (!outputWindow || !inputBox || !submitButton) {
		console.error("Initialization failed: One or more required DOM elements not found.");
		return;
	}
	historyIndex = commandHistory.length;
	currentInputBackup = '';
	if (ponderIntervalId) clearInterval(ponderIntervalId);
	ponderIntervalId = null;
	ponderText = '';
	ponderTickCount = 0;
	
	clearOutput();
	addOutput("Welcome to the Text Adventure Engine!");
	addOutput("Type commands and press Enter. Use ↑/↓ arrows for history.");
	inputBox.focus();
	autoResizeTextarea();
}

document.addEventListener('DOMContentLoaded', initializeGame);