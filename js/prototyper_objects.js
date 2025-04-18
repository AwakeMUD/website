/**
 * objects.js
 * Defines the GameObject class and handles commands directly interacting
 * with game objects (get, drop, look at <thing>, inventory, wear, remove).
 * Includes logic for matching abbreviated keywords based on source.
 */

// --- Constants for Wear Slots ---
const WEAR_SLOTS = ['head', 'torso', 'legs', 'feet']; // Assuming this is defined globally or imported

// --- GameObject Class ---
/**
 * Represents an interactable object in the game world.
 * Includes methods for matching keywords and abbreviations.
 * @param {string} id - A unique identifier for the object.
 * @param {string} shortName - The name displayed (e.g., "an iron lantern", "a chainmail hauberk").
 * @param {string[]} keywords - Words to refer to the object (e.g., ['iron', 'lantern'], ['chainmail', 'hauberk', 'mail']).
 * @param {string} roomDesc - Description when in a room.
 * @param {boolean} [wearable=false] - Can this item be worn?
 * @param {string | null} [wearSlot=null] - Where is it worn? (e.g., 'torso', 'head'). Must be in WEAR_SLOTS.
 * @param {boolean} [isContainer=false] - Can this object contain others?
 * @param {GameObject[]} [contains=[]] - Objects currently inside this container.
 */
class GameObject {
    constructor(id, shortName, keywords, roomDesc, wearable = false, wearSlot = null, isContainer = false, contains = []) {
        this.id = id;
        this.shortName = shortName;
        // Ensure keywords are stored in lowercase for consistent matching
        this.keywords = keywords.map(k => k.toLowerCase());
        this.roomDesc = roomDesc;
        this.wearable = wearable;
        this.isContainer = isContainer; // Added for potential container logic
        this.contains = contains;       // Added for potential container logic

        if (wearable && !WEAR_SLOTS.includes(wearSlot)) {
            console.warn(`GameObject "${id}" created with invalid wearSlot "${wearSlot}". Setting to null.`);
            this.wearSlot = null;
            this.wearable = false;
        } else {
            this.wearSlot = wearSlot;
        }
    }

    /**
	 * NEW: Checks if the provided user input keyword is an abbreviation
	 * (prefix) of any of this object's keywords.
	 * @param {string} userInputKeyword - A single keyword string (lowercase) from user input.
	 * @returns {boolean} True if the input is a prefix of any object keyword, false otherwise.
	 */
    matchesAbbreviation(userInputKeyword) {
        if (!userInputKeyword) return false; // Cannot match empty input
		// Check if any of the object's keywords start with the user's input keyword.
		return this.keywords.some(objKeyword => objKeyword.startsWith(userInputKeyword));
	}

     /** Checks if *all* provided user input keywords match (as abbreviations) this object's keywords. */
     matchesAllKeywords(userInputKeywords) {
         if (!userInputKeywords || userInputKeywords.length === 0) return false;
         // Every keyword the user typed must match *some* keyword of the object
         return userInputKeywords.every(inputWord =>
             this.keywords.some(objKeyword => objKeyword.startsWith(inputWord))
         );
     }
}


// --- REFACTORED Object Finding Logic ---

/**
 * Finds the first object matching the user's input keywords within the specified source(s).
 * Prioritizes matches where *all* input keywords match the object.
 * @param {string[]} keywords - The keywords (lowercase) from user input.
 * @param {string} source - Where to search ('room', 'inventory', 'worn', 'any', 'inventory_or_worn').
 * @returns {GameObject | null} The found object or null.
 */
function findObject(keywords, source) {
    if (!keywords || keywords.length === 0) return null;

    let potentialMatches = [];

    // 1. Gather objects from the specified source(s)
    const sourcesToSearch = [];
    if (source === 'room' || source === 'any') {
        sourcesToSearch.push(roomObjects);
    }
    if (source === 'inventory' || source === 'any' || source === 'inventory_or_worn') {
        sourcesToSearch.push(playerInventory);
    }
    if (source === 'worn' || source === 'any' || source === 'inventory_or_worn') {
        // Add worn items as simple objects to the search list
        sourcesToSearch.push(Object.values(wornItems).filter(item => item !== null));
    }

    // 2. Check each object in the combined list
    const combinedObjectList = sourcesToSearch.flat(); // Combine lists from different sources
    for (const obj of combinedObjectList) {
        if (obj.matchesAllKeywords(keywords)) {
            // Strong match (all input keywords match this object) - prioritize this
             return obj;
        }
        // Check for partial match (at least one input keyword matches)
        if (keywords.some(inputKeyword => obj.matchesAbbreviation(inputKeyword))) {
             potentialMatches.push(obj);
        }
    }

     // 3. If no strong match, return the first partial match found (if any)
     //    Could be enhanced to handle ambiguity if multiple partial matches exist.
     return potentialMatches.length > 0 ? potentialMatches[0] : null;

    // Note: Finding containers might need specific logic if 'CONTAINER' type means
    // searching only for objects where `obj.isContainer === true`.
    // The current implementation finds any object. Adjust if needed.
}


/**
 * Finds a *worn* object matching the keywords OR their abbreviations.
 * Returns the object itself, not the slot/item pair anymore.
 * (This might be deprecated if findObject with source 'worn' is sufficient)
 * @param {string[]} keywords - The keywords (lowercase) to search for from user input.
 * @returns {GameObject | null} The worn item object or null.
 */
function findWornObjectByKeywords(keywords) {
     // Delegate to the main findObject function
     return findObject(keywords, 'worn');
}


/**
 * Removes an object from a list by its ID.
 * @param {string} objectId - The unique ID of the object to remove.
 * @param {GameObject[]} objectList - The list to remove from.
 * @returns {GameObject | null} The removed object or null.
 */
function removeObjectById(objectId, objectList) {
	const index = objectList.findIndex(obj => obj.id === objectId);
	if (index !== -1) {
		return objectList.splice(index, 1)[0];
	}
	return null;
}

/**
 * Removes a worn object from its slot.
 * @param {string} objectId - The unique ID of the object to remove.
 * @returns {GameObject | null} The removed object or null.
 */
 function removeWornObjectById(objectId) {
     for (const slot in wornItems) {
         if (wornItems[slot] && wornItems[slot].id === objectId) {
             const removedItem = wornItems[slot];
             wornItems[slot] = null;
             return removedItem;
         }
     }
     return null;
 }


// --- UPDATED Object Command Handlers ---
// Now accept a single `parsedArgs` object instead of the `args` array.

/** Handles the 'INVENTORY' (i, inv) command. Accepts empty parsedArgs object. */
function handleInventoryCommand(parsedArgs) { // No args needed here
    let wearingSomething = false;
    let carryingSomething = false; // Keep track if carrying anything

    // --- Build Wearing Block ---
    let wearingOutput = "You are wearing:"; // Start with heading
    for (const slot of WEAR_SLOTS) {
        const item = wornItems[slot];
        if (item) {
            wearingOutput += `\n- ${item.shortName} (on ${slot})`; // Add item with newline
            wearingSomething = true;
        }
    }
    if (!wearingSomething) {
        wearingOutput += "\n- Nothing."; // Add message if nothing worn
    }
    // Output the entire wearing block as one paragraph
    addOutput(wearingOutput); //

    // --- Build Carrying Block ---
    let carryingOutput = "You are carrying:"; // Start with heading
	if (playerInventory.length === 0) {
		carryingOutput += "\n- Nothing."; // Add message if nothing carried
	} else {
		playerInventory.forEach(obj => {
			carryingOutput += `\n- ${obj.shortName}`; // Add item with newline
		});
        carryingSomething = true; // Set flag if inventory has items
	}
    // Output the entire carrying block as one paragraph
    addOutput(carryingOutput); //
}


/** Handles the 'GET' (take) command. Expects { item: GameObject } */
function handleGetCommand(parsedArgs) {
	const targetObject = parsedArgs.item; // Get object from parsed args

	if (!targetObject) {
         // This case should ideally be handled by the parser failing first
         console.error("Get handler called without a target object.");
         addOutput("Get what?"); // Fallback message
		return;
	}

    // Object was already found in the room by the parser using findObject(..., 'room')
	const removedObject = removeObjectById(targetObject.id, roomObjects);
	if (removedObject) {
		playerInventory.push(removedObject);
		addOutput(`You take ${removedObject.shortName}.`);
	} else {
		// This indicates a logic error - parser found it, but remove failed
		console.error(`Error: Could not remove object ${targetObject.id} from room after parser found it.`);
		addOutput("Something went wrong trying to pick that up.");
	}
}

/** Handles the 'DROP' command. Expects { item: GameObject } */
function handleDropCommand(parsedArgs) {
	const targetObject = parsedArgs.item; // Found in inventory or worn by parser

	if (!targetObject) {
		console.error("Drop handler called without a target object.");
        addOutput("Drop what?");
		return;
	}

    // Try removing from inventory first
    let removedObject = removeObjectById(targetObject.id, playerInventory);

    // If not in inventory, it must have been worn
    if (!removedObject) {
        removedObject = removeWornObjectById(targetObject.id);
         if (!removedObject) {
             // Logic error: parser found it inventory/worn, but couldn't be removed
             console.error(`Error: Could not remove object ${targetObject.id} from inventory or worn items.`);
             addOutput("Something went wrong trying to find what to drop.");
             return;
         }
    }

	// Add the removed object to the room
	roomObjects.push(removedObject);
	addOutput(`You drop ${removedObject.shortName}.`);
}


/** Handles looking AT a specific object ('look [at] <thing>'). Expects { item: GameObject } */
function handleLookAtCommand(parsedArgs) {
    const targetObject = parsedArgs.item; // Found anywhere by parser

    if (!targetObject) {
         console.error("Look At handler called without a target object.");
         addOutput("Look at what?");
        return;
    }

    let desc = `It is ${targetObject.shortName}.`;
    let wornLocation = null;

    // Check if the found object is currently worn
    for (const slot in wornItems) {
         if (wornItems[slot] && wornItems[slot].id === targetObject.id) {
             wornLocation = slot;
             break;
         }
     }

    if (wornLocation) {
        desc += ` (worn on your ${wornLocation})`;
    }
    // Provide wear information regardless of where it was found
    if (targetObject.wearable && targetObject.wearSlot) {
         // Check if player is carrying it if not worn
         const isCarried = playerInventory.some(invItem => invItem.id === targetObject.id);
         if (!wornLocation && isCarried) {
             desc += ` You could wear it on your ${targetObject.wearSlot}.`;
         } else if (!wornLocation && !isCarried) {
             // It's in the room
             desc += ` It looks like it could be worn on the ${targetObject.wearSlot}.`;
         }
    }
     // Add container info if applicable
     if (targetObject.isContainer) {
         if (targetObject.contains && targetObject.contains.length > 0) {
             desc += "\nInside, you see:";
             targetObject.contains.forEach(item => desc += `\n- ${item.shortName}`);
         } else {
             desc += " It appears to be empty.";
         }
     }

    addOutput(desc);
}


/** Handles the 'WEAR' command. Expects { item: GameObject } */
function handleWearCommand(parsedArgs) {
    const targetObject = parsedArgs.item; // Found in inventory by parser

    if (!targetObject) {
        console.error("Wear handler called without a target object.");
        addOutput("Wear what?");
        return;
    }

    // Parser should only find items in inventory (source: 'inventory')
    // Double-check wearable properties
    if (!targetObject.wearable) {
        addOutput(`You cannot wear ${targetObject.shortName}.`);
        return;
    }
    if (!targetObject.wearSlot) {
        console.error(`Error: Wearable object ${targetObject.id} has no wearSlot.`);
        addOutput(`Something is wrong with ${targetObject.shortName}.`);
        return;
    }
    if (wornItems[targetObject.wearSlot]) {
        addOutput(`You are already wearing ${wornItems[targetObject.wearSlot].shortName} on your ${targetObject.wearSlot}. You must remove it first.`);
        return;
    }

    // Remove from inventory
    const removedObject = removeObjectById(targetObject.id, playerInventory);
    if (removedObject) {
        wornItems[targetObject.wearSlot] = removedObject; // Place in worn slot
        addOutput(`You wear ${removedObject.shortName}.`);
    } else {
        console.error(`Error: Could not remove wearable object ${targetObject.id} from inventory after parser found it.`);
        addOutput("Something went wrong trying to wear that.");
    }
}

/** Handles the 'REMOVE' command. Expects { item: GameObject } */
function handleRemoveCommand(parsedArgs) {
     const targetObject = parsedArgs.item; // Found in worn items by parser

    if (!targetObject) {
        console.error("Remove handler called without a target object.");
        addOutput("Remove what?");
        return;
    }

    // Parser found it in 'worn' source. Now remove it properly.
    const removedObject = removeWornObjectById(targetObject.id);

    if (removedObject) {
        playerInventory.push(removedObject); // Add back to inventory
        addOutput(`You remove ${removedObject.shortName}.`);
    } else {
        console.error(`Error: Could not remove worn object ${targetObject.id} after parser found it.`);
        addOutput("Something went wrong trying to remove that.");
    }
}